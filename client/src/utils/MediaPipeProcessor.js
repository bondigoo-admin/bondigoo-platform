/* global MediaStreamTrackProcessor, MediaStreamTrackGenerator, VideoFrame, OffscreenCanvas, ImageData */

import { ImageSegmenter, FilesetResolver } from "@mediapipe/tasks-vision";
import { logger } from "./logger";

export const isBrowserSupported = () =>
  'MediaStreamTrackProcessor' in window && 'MediaStreamTrackGenerator' in window;

export const createMediaPipeProcessor = async (originalStream, initialSettings) => {
  logger.info('[MPP] createMediaPipeProcessor called.', { initialSettings });
  if (!isBrowserSupported()) {
    const errorMsg = "Your browser does not support the required WebCodecs API for background effects.";
    logger.error('[MPP] Browser not supported.', {
      hasMSTP: 'MediaStreamTrackProcessor' in window,
      hasMSTG: 'MediaStreamTrackGenerator' in window,
    });
    throw new Error(errorMsg);
  }

  let imageSegmenter;
  let trackProcessor;
  let trackGenerator;
  let offscreenCanvas;
  let canvasCtx;
  let backgroundImage = null;
  let currentSettings = { ...initialSettings };
  let frameCounter = 0;
  let frameConverterCanvas;
  let frameConverterCtx;

  const loadBackgroundImage = async (url) => {
    logger.info('[MPP] Loading background image from URL:', url);
    try {
      const response = await fetch(url, { mode: 'cors' });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const blob = await response.blob();
      backgroundImage = await createImageBitmap(blob);
      logger.info('[MPP] Background image loaded and created as ImageBitmap successfully.');
    } catch (error) {
      logger.error("[MPP] Failed to load background image. See details below.", {
        url,
        error,
        message: error?.message,
        stack: error?.stack,
      });
      backgroundImage = null;
    }
  };

  /**
   * Main drawing function. This uses canvas compositing to combine the original frame
   * with the segmentation mask and the desired background effect.
   * @param {VideoFrame} personFrame - The original video frame.
   * @param {CanvasImageSource} personMask - The segmentation mask (e.g., OffscreenCanvas) from MediaPipe.
   */
  const drawEffect = (personFrame, personMask) => {
    frameCounter++;
    const frameWidth = personFrame.codedWidth;
    const frameHeight = personFrame.codedHeight;

    if (frameCounter % 150 === 1) {
      logger.debug('[MPP Draw] Executing drawEffect.', { frame: frameCounter, mode: currentSettings.mode, canvasW: offscreenCanvas.width, canvasH: offscreenCanvas.height, frameW: frameWidth, frameH: frameHeight });
    }
    
    if ((offscreenCanvas.width !== frameWidth || offscreenCanvas.height !== frameHeight) && frameWidth > 0 && frameHeight > 0) {
      logger.info('[MPP Draw] Resizing OffscreenCanvas.', { from: `${offscreenCanvas.width}x${offscreenCanvas.height}`, to: `${frameWidth}x${frameHeight}` });
      offscreenCanvas.width = frameWidth;
      offscreenCanvas.height = frameHeight;
    }
    
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);

    canvasCtx.drawImage(personFrame, 0, 0, offscreenCanvas.width, offscreenCanvas.height);

    canvasCtx.globalCompositeOperation = 'destination-in';
    canvasCtx.drawImage(personMask, 0, 0, offscreenCanvas.width, offscreenCanvas.height);

    canvasCtx.globalCompositeOperation = 'destination-over';
    switch (currentSettings.mode) {
      case 'blur':
        canvasCtx.filter = `blur(${currentSettings.blurAmount || 15}px)`;
        canvasCtx.drawImage(personFrame, 0, 0, offscreenCanvas.width, offscreenCanvas.height);
        break;
      case 'image':
        if (backgroundImage) {
          canvasCtx.drawImage(backgroundImage, 0, 0, offscreenCanvas.width, offscreenCanvas.height);
        } else {
          canvasCtx.fillStyle = '#000000';
          canvasCtx.fillRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);
        }
        break;
      default:
        canvasCtx.fillStyle = '#000000';
        canvasCtx.fillRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);
    }
    canvasCtx.restore();
  };

  const initialize = async () => {
    logger.info('[MPP Init] Initializing MediaPipe with LOCAL files.');

    const wasmPath = '/mediapipe';
    logger.info(`[MPP Init] Step 1: Calling FilesetResolver.forVisionTasks with local path: "${wasmPath}"`);
    const filesetResolver = await FilesetResolver.forVisionTasks(wasmPath);
    logger.info('[MPP Init] Step 1 SUCCESS: FilesetResolver created.');

    const modelPath = '/mediapipe/image_segmenter.task';
    logger.info(`[MPP Init] Step 2: Calling ImageSegmenter.createFromOptions with model: "${modelPath}"`);
  
    try {
    const segmenterOptions = {
          baseOptions: { modelAssetPath: modelPath, delegate: "GPU" },
          runningMode: 'IMAGE', 
          outputCategoryMask: true,
      };
      logger.info('[MPP Init] Attempting to create Image-Segmenter with options:', JSON.stringify(segmenterOptions, null, 2));
      imageSegmenter = await ImageSegmenter.createFromOptions(filesetResolver, segmenterOptions);
    } catch (initializationError) {
      logger.error('[MPP Init] CRITICAL FAILURE: ImageSegmenter.createFromOptions() threw an exception.', {
          errorMessage: initializationError.message,
          errorName: initializationError.name,
          errorStack: initializationError.stack,
      });
      throw initializationError;
    }
   
    logger.info('[MPP Init] Step 2 SUCCESS: ImageSegmenter initialized.');
    
    logger.info('[MPP Init] Step 2b: Warming up the segmentation model with a 1x1 pixel.');
    try {
        const dummyPixel = new ImageData(new Uint8ClampedArray([0, 0, 0, 255]), 1, 1);
        const dummyBitmap = await createImageBitmap(dummyPixel);
        await imageSegmenter.segment(dummyBitmap);
        dummyBitmap.close(); // Best practice: release memory immediately
        logger.info('[MPP Init] Step 2b SUCCESS: Model warm-up complete.');
    } catch (warmupError) {
        logger.error('[MPP Init] CRITICAL FAILURE: Model warm-up failed.', {
            errorMessage: warmupError.message,
            errorName: warmupError.name,
            errorStack: warmupError.stack,
        });
        throw warmupError;
    }

    const [videoTrack] = originalStream.getVideoTracks();
    if (!videoTrack) {
        throw new Error("Original stream has no video track.");
    }
    
    logger.info('[MPP Init] Step 3: Got video track from original stream.');
    
    trackProcessor = new MediaStreamTrackProcessor({ track: videoTrack });
    trackGenerator = new MediaStreamTrackGenerator({ kind: 'video' });
    logger.info('[MPP Init] Step 4: TrackProcessor and TrackGenerator created.');

    const { width, height } = videoTrack.getSettings();
    offscreenCanvas = new OffscreenCanvas(width || 1280, height || 720);
    canvasCtx = offscreenCanvas.getContext('2d');
    logger.info('[MPP Init] Step 5: OffscreenCanvas for final composition created.', { width, height });
    
    // This canvas is a best practice for converting a VideoFrame to an ImageBitmap,
    // which is the required input for the segmenter.
    frameConverterCanvas = new OffscreenCanvas(width || 1280, height || 720);
    frameConverterCtx = frameConverterCanvas.getContext('2d');
    logger.info('[MPP Init] Step 5b: Frame converter canvas created.', { width, height });

    if (currentSettings.mode === 'image' && currentSettings.imageUrl) {
      logger.info('[MPP Init] Step 6: Loading background image...');
      await loadBackgroundImage(currentSettings.imageUrl);
      logger.info('[MPP Init] Step 6 SUCCESS: Background image loading finished.');
    }

    const transformStream = new TransformStream({
      async transform(videoFrame, controller) {
        try {
          const frameWidth = videoFrame.codedWidth;
          const frameHeight = videoFrame.codedHeight;

          // NEW: Guard against invalid frames
          if (!frameWidth || !frameHeight) {
            logger.warn('[MPP Transform] Skipping invalid incoming frame with zero dimensions.', { frame: frameCounter, w: frameWidth, h: frameHeight });
            videoFrame.close(); // Still need to close it
            return;
          }

          if (frameCounter % 150 === 0) {
            logger.debug('[MPP Transform] Received frame for processing.', { frame: frameCounter, w: frameWidth, h: frameHeight });
          }

          if (!imageSegmenter) {
            logger.warn('[MPP Transform] Skipping frame, segmenter not ready.');
            controller.enqueue(videoFrame.clone()); // Pass through original frame
            return;
          }
            
          let frameBitmap;
          try {
            // BEST PRACTICE: Convert VideoFrame to ImageBitmap via a 2D canvas for maximum compatibility.
            if (frameConverterCanvas.width !== frameWidth || frameConverterCanvas.height !== frameHeight) {
                frameConverterCanvas.width = frameWidth;
                frameConverterCanvas.height = frameHeight;
            }
            frameConverterCtx.drawImage(videoFrame, 0, 0);
            frameBitmap = await createImageBitmap(frameConverterCanvas);

           const result = await imageSegmenter.segment(frameBitmap);
                
            if (result && result.categoryMask) {
              try {
                if (frameCounter % 150 === 0) {
                  logger.debug(`[MPP MASK] Successfully received mask.`, {
                    frame: frameCounter,
                    maskType: 'Canvas',
                    maskW: result.categoryMask.width,
                    maskH: result.categoryMask.height
                  });
                }
  
                drawEffect(videoFrame, result.categoryMask.canvas);
                
                const newFrame = new VideoFrame(offscreenCanvas, {
                    timestamp: videoFrame.timestamp,
                    alpha: 'keep',
                });
                controller.enqueue(newFrame);
              } finally {
                result.categoryMask.close();
              }
            } else {
              logger.warn('[MPP Transform] Segmentation result missing categoryMask or its canvas. Passing original frame.', { frame: frameCounter, resultKeys: result ? Object.keys(result) : 'result is null' });
              controller.enqueue(videoFrame.clone());
            }
          } finally {
            // BEST PRACTICE: Ensure bitmaps are closed to free up GPU memory.
            if (frameBitmap) {
              frameBitmap.close();
            }
          }
        } catch (e) {
            logger.error('[MPP Transform] An unexpected error occurred during frame processing.', {
                errorMessage: e.message,
                errorName: e.name,
                errorStack: e.stack,
            });
            controller.enqueue(videoFrame.clone()); // Pass through on error
        } finally {
            videoFrame.close(); // CRITICAL: Always close the incoming frame.
        }
      },
    });

    trackProcessor.readable
      .pipeThrough(transformStream)
      .pipeTo(trackGenerator.writable)
      .catch(e => logger.error("[MPP] Stream pipeline error", e));
    logger.info('[MPP Init] Stream pipeline connected.');
  };

  const processor = {
    processedStream: null,
    updateSettings: async (newSettings) => {
      logger.info('[MPP] updateSettings called.', { newSettings });
      if (
        newSettings.mode === 'image' &&
        newSettings.imageUrl &&
        newSettings.imageUrl !== currentSettings.imageUrl
      ) {
        await loadBackgroundImage(newSettings.imageUrl);
      }
      currentSettings = { ...currentSettings, ...newSettings };
    },
    destroy: () => {
      logger.info("[MPP Cleanup] Destroying MediaPipe Processor...");
      try {
        if (trackProcessor && trackProcessor.readable) {
          trackProcessor.readable.cancel().catch(e => logger.warn('[MPP Cleanup] Error cancelling trackProcessor readable', { message: e.message }));
        }
        if (trackGenerator && trackGenerator.writable && !trackGenerator.writable.locked) {
          trackGenerator.writable.getWriter().close().catch(e => logger.warn('[MPP Cleanup] Error closing trackGenerator writable', { message: e.message }));
        }
        if (imageSegmenter) {
          imageSegmenter.close();
          imageSegmenter = null;
          logger.info("[MPP Cleanup] ImageSegmenter closed.");
        }
        backgroundImage = null;
        offscreenCanvas = null;
        canvasCtx = null;
        frameConverterCanvas = null;
        frameConverterCtx = null;
        logger.info("[MPP Cleanup] Canvases and background image resources released.");
        logger.info("[MPP Cleanup] MediaPipe Processor destroyed successfully.");
      } catch (error) {
        logger.error("[MPP Cleanup] Error during MediaPipe Processor destruction:", {
          name: error.name,
          message: error.message,
          stack: error.stack,
        });
      }
    },
  };

  try {
    await initialize();
    const [audioTrack] = originalStream.getAudioTracks();
    const tracks = [trackGenerator];
    if (audioTrack) {
      tracks.push(audioTrack);
    }
    processor.processedStream = new MediaStream(tracks);
    logger.info('[MPP] Processor created successfully. Final stream has', {
        videoTracks: processor.processedStream.getVideoTracks().length,
        audioTracks: processor.processedStream.getAudioTracks().length
    });
    return processor;
  } catch (error) {
    logger.error("[MPP] CRITICAL FAILURE during processor initialization.", {
      message: error?.message,
      name: error?.name,
      stack: error?.stack,
    });
    // Ensure all partial resources are cleaned up on initialization failure.
    processor.destroy();
    throw error;
  }
};