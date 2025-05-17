// 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
'use client';

import React, { useRef, useEffect, useState } from 'react';
import { PoseLandmarker, FilesetResolver, DrawingUtils } from '@mediapipe/tasks-vision';

// Utility to calculate angle at point b (in degrees)
function getAngle(a: {x: number, y: number}, b: {x: number, y: number}, c: {x: number, y: number}): number {
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

type CameraDevice = {
  deviceId: string;
  label: string;
};

const CameraWithPoseClient: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState<{w: number; h: number}>({w: 0, h: 0});
  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  // Get camera devices after permission is granted
  useEffect(() => {
    const getDevices = async () => {
      try {
        // Request permission so labels are available[1][3][7]
        await navigator.mediaDevices.getUserMedia({ video: true });
        const allDevices = await navigator.mediaDevices.enumerateDevices(); // [1][2][3][5][7]
        const videoDevices = allDevices
          .filter((d) => d.kind === 'videoinput')
          .map((d, i) => ({
            deviceId: d.deviceId,
            label: d.label || `Camera ${i + 1}`
          }));
        setDevices(videoDevices);

        // Prefer back camera if available, else first camera
        const backCam = videoDevices.find((d) =>
          d.label.toLowerCase().includes('back') ||
          d.label.toLowerCase().includes('environment')
        );
        setSelectedDeviceId(backCam?.deviceId || videoDevices[0]?.deviceId || null);
      } catch (err) {
        alert('Could not access camera. Please allow camera access and try again.');
      }
    };
    getDevices();
  }, []);

  // Start the camera when selectedDeviceId changes
  useEffect(() => {
    if (!selectedDeviceId) return;
    // Stop previous stream if needed
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: selectedDeviceId } }
    }).then((newStream) => {
      setStream(newStream);
      if (videoRef.current) videoRef.current.srcObject = newStream;

      // Wait for video metadata to get dimensions
      if (videoRef.current) {
        videoRef.current.onloadedmetadata = () => {
          if (videoRef.current) {
            setDimensions({
              w: videoRef.current.videoWidth,
              h: videoRef.current.videoHeight
            });
          }
        };
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDeviceId]);

  // Pose detection and drawing
  useEffect(() => {
    let animationFrameId: number;
    let poseLandmarker: PoseLandmarker | null = null;
    let drawingUtils: DrawingUtils | null = null;
    let isMounted = true;

    const setup = async () => {
      if (!dimensions.w || !dimensions.h) return;
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

            // Draw the angle as text on the canvas
            if (backAngle !== null) {
              ctx.save();
              ctx.font = '32px Arial';
              ctx.fillStyle = isBent ? '#FF0000' : '#00FF00';
              ctx.strokeStyle = '#000000';
              ctx.lineWidth = 3;
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
    };
  }, [dimensions.w, dimensions.h]);

  return (
    <div style={{ position: 'relative', width: dimensions.w, height: dimensions.h }}>
      {devices.length > 1 && (
        <div style={{ position: 'absolute', zIndex: 10, left: 10, top: 10, background: 'rgba(255,255,255,0.8)', borderRadius: 8, padding: 4 }}>
          <select
            value={selectedDeviceId || ''}
            onChange={e => setSelectedDeviceId(e.target.value)}
          >
            {devices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label}
              </option>
            ))}
          </select>
        </div>
      )}
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
