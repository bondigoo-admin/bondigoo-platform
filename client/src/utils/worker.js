importScripts('https://unpkg.com/@tensorflow/tfjs-core/dist/tf-core.min.js');
importScripts('https://unpkg.com/@tensorflow/tfjs-backend-webgl/dist/tf-backend-webgl.min.js');
importScripts('https://unpkg.com/@tensorflow-models/body-pix/dist/body-pix.min.js');

let model = null;
let lastSegmentation = null;
let lastFrameHash = null;
const redis = new (self.Redis || function () {
  return { setex: () => Promise.resolve(), get: () => Promise.resolve(null) };
})('redis://localhost:6379'); // Fallback if Redis not available
const FRAME_DIFFERENCE_THRESHOLD = 0.1; // Threshold for significant frame change
let frameCounter = 0;
let lastCleanupTime = Date.now();
const CLEANUP_INTERVAL = 10 * 60 * 1000; // Cleanup every 10 minutes

self.onmessage = async (e) => {
  try {
    if (e.data.type === 'init') {
      await tf.setBackend('webgl');
      model = await bodyPix.load({
        architecture: 'MobileNetV1',
        outputStride: 16,
        multiplier: 0.75,
        quantBytes: 2,
      });
      self.postMessage({ type: 'ready' });
      console.info('[Worker] Model initialized successfully');
    } else if (e.data.type === 'segment' && model) {
      frameCounter++;
      const { videoData, width, height, frameHash, sessionId } = e.data;

      // Check Redis cache first
      const cacheKey = `segmentation:${sessionId}:${frameHash}`;
      let cached = null;
      try {
        cached = await redis.get(cacheKey);
      } catch (error) {
        console.warn('[Worker] Redis get error, proceeding without cache', { error: error.message });
      }
      if (cached) {
        const segmentation = JSON.parse(cached);
        self.postMessage({ type: 'segmented', segmentation }, [segmentation.data.buffer]);
        console.info('[Worker] Cached segmentation used', { cacheKey });
        return;
      }

      // Skip if frame is similar to the last one
      if (lastFrameHash && lastSegmentation && frameCounter % 2 === 0) {
        const difference = computeFrameDifference(frameHash, lastFrameHash);
        if (difference < FRAME_DIFFERENCE_THRESHOLD) {
          self.postMessage({ type: 'segmented', segmentation: lastSegmentation }, [lastSegmentation.data.buffer]);
          console.info('[Worker] Frame skipped due to low difference', { difference });
          return;
        }
      }

      tf.engine().startScope();
      const segmentation = await model.segmentPerson(
        { data: new Uint8ClampedArray(videoData), width, height },
        { internalResolution: 'medium', segmentationThreshold: 0.5, maxDetections: 1 }
      );
      lastSegmentation = segmentation;
      lastFrameHash = frameHash;

      // Cache in Redis for 5 seconds
      try {
        await redis.setex(cacheKey, 5, JSON.stringify(segmentation));
        console.info('[Worker] Segmentation cached', { cacheKey });
      } catch (error) {
        console.warn('[Worker] Redis setex error, proceeding without caching', { error: error.message });
      }

      self.postMessage({ type: 'segmented', segmentation }, [segmentation.data.buffer]);
      console.info('[Worker] Segmentation completed', { width, height });

      // Periodic cleanup
      if (Date.now() - lastCleanupTime > CLEANUP_INTERVAL) {
        tf.disposeVariables();
        lastCleanupTime = Date.now();
        console.info('[Worker] Periodic cleanup performed');
      }

      tf.engine().endScope();
    }
  } catch (error) {
    console.error('[Worker] Segmentation error', { error: error.message, stack: error.stack });
    self.postMessage({ type: 'error', error: error.message });
  }
};

function computeFrameHash(data) {
  let hash = 0;
  for (let i = 0; i < data.length; i += 100) {
    hash = (hash * 31 + data[i]) | 0;
  }
  return hash.toString(16);
}

function computeFrameDifference(hash1, hash2) {
  const num1 = parseInt(hash1, 16);
  const num2 = parseInt(hash2, 16);
  return Math.abs(num1 - num2) / Math.max(num1, num2, 1);
}