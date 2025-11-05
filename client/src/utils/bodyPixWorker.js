importScripts('https://unpkg.com/@tensorflow/tfjs-core/dist/tf-core.min.js');
importScripts('https://unpkg.com/@tensorflow/tfjs-backend-webgl/dist/tf-backend-webgl.min.js');
importScripts('https://unpkg.com/@tensorflow-models/body-pix/dist/body-pix.min.js');

let model;
let lastSegmentation = null;
let lastFrameHash = null;
const FRAME_SKIP = 3; 
let frameCounter = 0;

self.onmessage = async (e) => {
  if (e.data.type === 'init') {
    await tf.setBackend('webgl');
    model = await bodyPix.load({
      architecture: 'MobileNetV1',
      outputStride: 16,
      multiplier: 0.75,
      quantBytes: 2,
    });
    self.postMessage({ type: 'ready' });
  } else if (e.data.type === 'segment' && model) {
    frameCounter++;
    const { videoData, width, height, frameHash } = e.data;

    // Skip segmentation if the frame hasn’t changed significantly
    if (frameHash === lastFrameHash && lastSegmentation) {
      self.postMessage({ type: 'segmented', segmentation: lastSegmentation }, [lastSegmentation.data.buffer]);
      return;
    }

    // Skip segmentation based on frame counter
    if (frameCounter % FRAME_SKIP !== 0 && lastSegmentation) {
      self.postMessage({ type: 'segmented', segmentation: lastSegmentation }, [lastSegmentation.data.buffer]);
      return;
    }

    const segmentation = await model.segmentPerson(
      { data: new Uint8ClampedArray(videoData), width, height },
      { internalResolution: 'medium', segmentationThreshold: 0.5, maxDetections: 1 }
    );
    lastSegmentation = segmentation;
    lastFrameHash = frameHash;
    self.postMessage({ type: 'segmented', segmentation }, [segmentation.data.buffer]);
  }
};