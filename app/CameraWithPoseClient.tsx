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
  const [isCameraOn, setIsCameraOn] = useState(false);

  // Get camera devices after permission is granted
  useEffect(() => {
    const getDevices = async () => {
      try {
        await navigator.mediaDevices.getUserMedia({ video: true });
        const allDevices = await navigator.mediaDevices.enumerateDevices();
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

  // Start camera
  const handleStartCamera = async () => {
    if (!selectedDeviceId) return;
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: selectedDeviceId } }
      });
      setStream(newStream);
      setIsCameraOn(true);
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
    } catch (err) {
      alert('Could not start camera. Please allow camera access and try again.');
    }
  };

  // Stop camera
  const handleStopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setIsCameraOn(false);
    setDimensions({w: 0, h: 0});
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  };

  // Stop stream on unmount
  useEffect(() => {
    return () => {
      if (stream) stream.getTracks().forEach(track => track.stop());
    };
  }, [stream]);

  // Pose detection and drawing
  useEffect(() => {
    let animationFrameId: number;
    let poseLandmarker: PoseLandmarker | null = null;
    let drawingUtils: DrawingUtils | null = null;
    let isMounted = true;

    const setup = async () => {
      if (!isCameraOn || !dimensions.w || !dimensions.h) return;
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
          canvasRef.current &&
          isCameraOn
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
        if (isMounted && isCameraOn) animationFrameId = requestAnimationFrame(processFrame);
      };
      processFrame();
    };

    setup();

    return () => {
      isMounted = false;
      cancelAnimationFrame(animationFrameId);
    };
  }, [dimensions.w, dimensions.h, isCameraOn]);

  return (
    <div>
      {/* Controls above the camera area */}
      <div style={{ marginBottom: 16 }}>
        {devices.length > 1 && (
          <select
            value={selectedDeviceId || ''}
            onChange={e => setSelectedDeviceId(e.target.value)}
            disabled={isCameraOn}
            style={{ marginRight: 8 }}
          >
            {devices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label}
              </option>
            ))}
          </select>
        )}
        <button onClick={handleStartCamera} disabled={isCameraOn || !selectedDeviceId} style={{ marginRight: 8 }}>
          Start Camera
        </button>
        <button onClick={handleStopCamera} disabled={!isCameraOn}>
          Stop Camera
        </button>
      </div>
      {/* Camera and overlay area */}
      <div style={{ position: 'relative', width: dimensions.w || 400, height: dimensions.h || 300, background: '#222' }}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          style={{ display: 'none' }}
        />
        <canvas
          ref={canvasRef}
          width={dimensions.w || 400}
          height={dimensions.h || 300}
          style={{ position: 'absolute', top: 0, left: 0 }}
        />
      </div>
    </div>
  );
};

export default CameraWithPoseClient;
