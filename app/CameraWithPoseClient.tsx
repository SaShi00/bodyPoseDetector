// const WIDTH = 640;
// const HEIGHT = 480;
// const MODEL_ASSET_PATH = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';


// 'use client';

// import React, { useRef, useEffect, useState } from 'react';
// import { PoseLandmarker, FilesetResolver, DrawingUtils } from '@mediapipe/tasks-vision';

// // Utility to calculate angle at point b (in degrees)
// function getAngle(a: {x: number, y: number}, b: {x: number, y: number}, c: {x: number, y: number}) {
//   const ab = { x: a.x - b.x, y: a.y - b.y };
//   const cb = { x: c.x - b.x, y: c.y - b.y };
//   const dot = ab.x * cb.x + ab.y * cb.y;
//   const magAB = Math.sqrt(ab.x * ab.x + ab.y * ab.y);
//   const magCB = Math.sqrt(cb.x * cb.x + cb.y * cb.y);
//   const cosine = dot / (magAB * magCB);
//   return Math.acos(Math.max(-1, Math.min(1, cosine))) * (180 / Math.PI);
// }

// const MODEL_ASSET_PATH = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
// // 'https://storage.googleapis.com/mediapipe-tasks/pose_landmarker/lite/pose_landmarker_lite.task';
// const WASM_PATH = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';

// const CameraWithPoseClient: React.FC = () => {
//   const videoRef = useRef<HTMLVideoElement>(null);
//   const canvasRef = useRef<HTMLCanvasElement>(null);
//   const [dimensions, setDimensions] = useState<{w: number; h: number}>({w: 0, h: 0});

//   useEffect(() => {
//     let animationFrameId: number;
//     let poseLandmarker: PoseLandmarker | null = null;
//     let drawingUtils: DrawingUtils | null = null;
//     let isMounted = true;

//     const setup = async () => {
//       // 1. Get camera stream
//       const stream = await navigator.mediaDevices.getUserMedia({
//         video: { facingMode: 'user' }
//       });
//       if (videoRef.current) videoRef.current.srcObject = stream;

//       // 2. Wait for the video to be ready and get its actual size
//       await new Promise<void>((resolve) => {
//         if (!videoRef.current) return resolve();
//         videoRef.current.onloadedmetadata = () => {
//           if (videoRef.current) {
//             const w = videoRef.current.videoWidth;
//             const h = videoRef.current.videoHeight;
//             setDimensions({w, h});
//           }
//           resolve();
//         };
//       });

//       // 3. Load model and drawing utils
//       const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
//       poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
//         baseOptions: {
//           modelAssetPath: MODEL_ASSET_PATH,
//           delegate: 'CPU',
//         },
//         runningMode: 'VIDEO',
//         numPoses: 1,
//       });
//       drawingUtils = new DrawingUtils(canvasRef.current!.getContext('2d')!);

//       // 4. Start processing frames
//       const processFrame = async () => {
//         if (
//           videoRef.current &&
//           poseLandmarker &&
//           drawingUtils &&
//           canvasRef.current
//         ) {
//           const ctx = canvasRef.current.getContext('2d')!;
//           ctx.clearRect(0, 0, dimensions.w, dimensions.h);

//           // Draw video frame to canvas at actual size
//           ctx.drawImage(videoRef.current, 0, 0, dimensions.w, dimensions.h);

//           // Run pose detection
//           const results = poseLandmarker.detectForVideo(
//             videoRef.current,
//             performance.now()
//           );

//           if (results.landmarks && results.landmarks.length > 0) {
//             const lm = results.landmarks[0];

//             // Use left side: shoulder(11), hip(23), knee(25)
//             const leftShoulder = lm[11];
//             const leftHip = lm[23];
//             const leftKnee = lm[25];

//             let backAngle = null;
//             if (leftShoulder && leftHip && leftKnee) {
//               backAngle = getAngle(leftShoulder, leftHip, leftKnee);
//             }
//             // Threshold: e.g., <140° is "bent"
//             const isBent = backAngle !== null && backAngle < 140;

//             drawingUtils.drawLandmarks(
//               lm,
//               { color: isBent ? '#FF0000' : '#00FF00', lineWidth: 2 }
//             );
//             drawingUtils.drawConnectors(
//               lm,
//               PoseLandmarker.POSE_CONNECTIONS,
//               { color: isBent ? '#FF0000' : '#00FF00', lineWidth: 4 }
//             );
//           }
//         }
//         if (isMounted) animationFrameId = requestAnimationFrame(processFrame);
//       };
//       processFrame();
//     };

//     setup();

//     return () => {
//       isMounted = false;
//       cancelAnimationFrame(animationFrameId);
//       poseLandmarker?.close();
//     };
//   }, [dimensions.w, dimensions.h]);

//   return (
//     <div style={{ position: 'relative', width: dimensions.w, height: dimensions.h }}>
//       <video
//         ref={videoRef}
//         autoPlay
//         playsInline
//         style={{ display: 'none' }}
//       />
//       <canvas
//         ref={canvasRef}
//         width={dimensions.w}
//         height={dimensions.h}
//         style={{ position: 'absolute', top: 0, left: 0 }}
//       />
//     </div>
//   );
// };

// export default CameraWithPoseClient;

'use client';

import React, { useRef, useEffect, useState } from 'react';
import { PoseLandmarker, FilesetResolver, DrawingUtils } from '@mediapipe/tasks-vision';

// Utility to calculate angle at point b (in degrees)
function getAngle(a: {x: number, y: number}, b: {x: number, y: number}, c: {x: number, y: number}) {
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const dot = ab.x * cb.x + ab.y * cb.y;
  const magAB = Math.sqrt(ab.x * ab.x + ab.y * ab.y);
  const magCB = Math.sqrt(cb.x * cb.x + cb.y * cb.y);
  const cosine = dot / (magAB * magCB);
  return Math.acos(Math.max(-1, Math.min(1, cosine))) * (180 / Math.PI);
}

const MODEL_ASSET_PATH = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const WASM_PATH = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';

const CameraWithPoseClient: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState<{w: number; h: number}>({w: 0, h: 0});

  useEffect(() => {
    let animationFrameId: number;
    let poseLandmarker: PoseLandmarker | null = null;
    let drawingUtils: DrawingUtils | null = null;
    let isMounted = true;

    const setup = async () => {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' }
      });
      if (videoRef.current) videoRef.current.srcObject = stream;

      await new Promise<void>((resolve) => {
        if (!videoRef.current) return resolve();
        videoRef.current.onloadedmetadata = () => {
          if (videoRef.current) {
            const w = videoRef.current.videoWidth;
            const h = videoRef.current.videoHeight;
            setDimensions({w, h});
          }
          resolve();
        };
      });

      const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
      poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MODEL_ASSET_PATH,
          delegate: 'CPU',
        },
        runningMode: 'VIDEO',
        numPoses: 1,
      });
      drawingUtils = new DrawingUtils(canvasRef.current!.getContext('2d')!);

      const processFrame = async () => {
        if (
          videoRef.current &&
          poseLandmarker &&
          drawingUtils &&
          canvasRef.current
        ) {
          const ctx = canvasRef.current.getContext('2d')!;
          ctx.clearRect(0, 0, dimensions.w, dimensions.h);

          ctx.drawImage(videoRef.current, 0, 0, dimensions.w, dimensions.h);

          const results = poseLandmarker.detectForVideo(
            videoRef.current,
            performance.now()
          );

          if (results.landmarks && results.landmarks.length > 0) {
            const lm = results.landmarks[0];

            // Use left side: shoulder(11), hip(23), knee(25)
            const leftShoulder = lm[11];
            const leftHip = lm[23];
            const leftKnee = lm[25];

            let backAngle: number | null = null;
            if (leftShoulder && leftHip && leftKnee) {
              backAngle = getAngle(leftShoulder, leftHip, leftKnee);
            }
            const isBent = backAngle !== null && backAngle < 140;

            drawingUtils.drawLandmarks(
              lm,
              { color: isBent ? '#FF0000' : '#00FF00', lineWidth: 2 }
            );
            drawingUtils.drawConnectors(
              lm,
              PoseLandmarker.POSE_CONNECTIONS,
              { color: isBent ? '#FF0000' : '#00FF00', lineWidth: 4 }
            );

            // === Draw the angle as text on the canvas ===
            if (backAngle !== null) {
              ctx.save();
              ctx.font = '32px Arial';
              ctx.fillStyle = isBent ? '#FF0000' : '#00FF00';
              ctx.strokeStyle = '#000000';
              ctx.lineWidth = 3;
              // Draw background for better visibility
              const text = `Back angle: ${backAngle.toFixed(1)}°`;
              const x = leftHip.x * dimensions.w;
              const y = leftHip.y * dimensions.h - 10;
              ctx.strokeText(text, x, y);
              ctx.fillText(text, x, y);
              ctx.restore();
            }
          }
        }
        if (isMounted) animationFrameId = requestAnimationFrame(processFrame);
      };
      processFrame();
    };

    setup();

    return () => {
      isMounted = false;
      cancelAnimationFrame(animationFrameId);
      poseLandmarker?.close();
    };
  }, [dimensions.w, dimensions.h]);

  return (
    <div style={{ position: 'relative', width: dimensions.w, height: dimensions.h }}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        style={{ display: 'none' }}
      />
      <canvas
        ref={canvasRef}
        width={dimensions.w}
        height={dimensions.h}
        style={{ position: 'absolute', top: 0, left: 0 }}
      />
    </div>
  );
};

export default CameraWithPoseClient;
