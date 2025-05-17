'use client';

import React, { useRef, useEffect, useState } from 'react';
import { Button, Select, MenuItem, FormControl, InputLabel, Box } from '@mui/material';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
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

const MODEL_ASSET_PATH =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const WASM_PATH =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';

type CameraDevice = {
  deviceId: string;
  label: string;
};

const CameraWithPoseClient: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [videoDims, setVideoDims] = useState({ width: 400, height: 300 });
  const animationRef = useRef<number | null>(null);

  // Responsive width setup (max 600px or screen width)
  useEffect(() => {
    const updateDims = () => {
      setVideoDims((dims) => {
        const maxWidth = Math.min(window.innerWidth, 600);
        const ratio = dims.width / dims.height;
        return {
          width: maxWidth,
          height: Math.round(maxWidth / ratio),
        };
      });
    };
    updateDims();
    window.addEventListener('resize', updateDims);
    return () => window.removeEventListener('resize', updateDims);
  }, []);

  // Get camera devices
  useEffect(() => {
    const getDevices = async () => {
      try {
        await navigator.mediaDevices.getUserMedia({ video: true });
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = allDevices
          .filter((d) => d.kind === 'videoinput')
          .map((d, i) => ({
            deviceId: d.deviceId,
            label: d.label || `Camera ${i + 1}`,
          }));
        setDevices(videoDevices);

        const backCam = videoDevices.find(
          (d) =>
            d.label.toLowerCase().includes('back') ||
            d.label.toLowerCase().includes('environment')
        );
        setSelectedDeviceId(backCam?.deviceId || videoDevices[0]?.deviceId || null);
      } catch {
        alert('Could not access camera. Please allow camera access and try again.');
      }
    };
    getDevices();
  }, []);

  // Start camera
  const handleStartCamera = async () => {
    if (!selectedDeviceId) return;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: selectedDeviceId } },
      });
      setStream(newStream);
      setIsCameraOn(true);
      if (videoRef.current) videoRef.current.srcObject = newStream;

      if (videoRef.current) {
        videoRef.current.onloadedmetadata = () => {
          const vw = videoRef.current!.videoWidth;
          const vh = videoRef.current!.videoHeight;
          // Responsive: fit width to screen, scale height by real aspect ratio
          const maxWidth = Math.min(window.innerWidth, 600);
          const scale = maxWidth / vw;
          setVideoDims({
            width: maxWidth,
            height: Math.round(vh * scale),
          });
        };
      }
    } catch {
      alert('Could not start camera. Please allow camera access and try again.');
    }
  };

  // Stop camera
  const handleStopCamera = () => {
    setIsCameraOn(false);
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (stream) stream.getTracks().forEach((track) => track.stop());
    };
  }, [stream]);

  // Pose detection and drawing (continuous loop)
  useEffect(() => {
    let poseLandmarker: PoseLandmarker | null = null;
    let drawingUtils: DrawingUtils | null = null;
    let isMounted = true;

    const runPoseDetection = async () => {
      if (!isCameraOn || !videoDims.width || !videoDims.height) return;

      if (!poseLandmarker) {
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
      }

      const drawFrame = async () => {
        if (
          videoRef.current &&
          poseLandmarker &&
          drawingUtils &&
          canvasRef.current &&
          isMounted &&
          isCameraOn
        ) {
          const ctx = canvasRef.current.getContext('2d')!;
          ctx.clearRect(0, 0, videoDims.width, videoDims.height);

          ctx.drawImage(videoRef.current, 0, 0, videoDims.width, videoDims.height);

          const results = poseLandmarker.detectForVideo(videoRef.current, performance.now());

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

            drawingUtils.drawLandmarks(lm, { color: isBent ? '#FF69B4' : '#00CFFF', lineWidth: 3 });
            drawingUtils.drawConnectors(lm, PoseLandmarker.POSE_CONNECTIONS, {
              color: isBent ? '#FF69B4' : '#00CFFF',
              lineWidth: 5,
            });

            if (backAngle !== null) {
              ctx.save();
              ctx.font = 'bold 32px Arial';
              ctx.fillStyle = isBent ? '#FF69B4' : '#00CFFF';
              ctx.strokeStyle = '#fff';
              ctx.lineWidth = 4;
              const text = `Back angle: ${backAngle.toFixed(1)}°`;
              const x = leftHip.x * videoDims.width;
              const y = leftHip.y * videoDims.height - 10;
              ctx.strokeText(text, x, y);
              ctx.fillText(text, x, y);
              ctx.restore();
            }
          }
        }
        if (isMounted && isCameraOn) {
          animationRef.current = requestAnimationFrame(drawFrame);
        }
      };
      animationRef.current = requestAnimationFrame(drawFrame);
    };

    if (isCameraOn) {
      runPoseDetection();
    }
    return () => {
      isMounted = false;
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [videoDims.width, videoDims.height, isCameraOn]);

  // Cute Camera Dropdown
  const CuteCameraSelect = (
    <FormControl
      variant="outlined"
      size="small"
      sx={{
        minWidth: 200,
        borderRadius: 3,
        boxShadow: '0 2px 8px rgba(255, 105, 180, 0.18)',
        backgroundColor: '#fff0f6',
        '& .MuiOutlinedInput-root': {
          borderRadius: 3,
          '& fieldset': {
            borderColor: '#ff69b4',
          },
          '&:hover fieldset': {
            borderColor: '#ff85c0',
          },
          '&.Mui-focused fieldset': {
            borderColor: '#ff1493',
            borderWidth: 2,
          },
        },
      }}
      disabled={isCameraOn}
    >
      <InputLabel
        id="camera-select-label"
        sx={{
          color: '#ff1493',
          fontWeight: 'bold',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <CameraAltIcon sx={{ mr: 1, color: '#ff1493' }} />
        Camera
      </InputLabel>
      <Select
        labelId="camera-select-label"
        value={selectedDeviceId || ''}
        onChange={(e) => setSelectedDeviceId(e.target.value)}
        label="Camera"
        IconComponent={ArrowDropDownIcon}
        sx={{
          color: '#d81b60',
          fontWeight: 'bold',
          '& .MuiSelect-icon': {
            color: '#ff1493',
          },
        }}
      >
        {devices.map((device) => (
          <MenuItem key={device.deviceId} value={device.deviceId}>
            {device.label}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );

  return (
    <div>
      {/* Controls */}
      <Box mb={2} display="flex" alignItems="center" gap={2} flexWrap="wrap">
        {devices.length > 1 && CuteCameraSelect}
        <Button
          variant="contained"
          sx={{
            background: 'linear-gradient(90deg,rgb(255, 105, 105) 0%,rgb(255, 105, 105) 100%)',
            color: '#fff',
            fontWeight: 'bold',
            borderRadius: 3,
            px: 3,
            boxShadow: 2,
            '&:hover': {
              background: 'linear-gradient(90deg, #FFB347 0%, #FF69B4 100%)',
            },
          }}
          onClick={handleStartCamera}
          disabled={isCameraOn || !selectedDeviceId}
        >
          Start Camera
        </Button>
        <Button
          variant="contained"
          sx={{
            background: 'linear-gradient(90deg, #00CFFF 0%, #00CFFF 100%)',
            color: '#fff',
            fontWeight: 'bold',
            borderRadius: 3,
            px: 3,
            boxShadow: 2,
            '&:hover': {
              background: 'linear-gradient(90deg, #FF69B4 0%, #00CFFF 100%)',
            },
          }}
          onClick={handleStopCamera}
          disabled={!isCameraOn}
        >
          Stop Camera
        </Button>
      </Box>

      {/* Responsive camera area */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: videoDims.width,
          aspectRatio: `${videoDims.width} / ${videoDims.height}`,
          background: '#222',
          borderRadius: 16,
          overflow: 'hidden',
          boxShadow: '0 4px 24px rgba(0,0,0,0.25)',
        }}
      >
        <video ref={videoRef} autoPlay playsInline style={{ display: 'none' }} />
        <canvas
          ref={canvasRef}
          width={videoDims.width}
          height={videoDims.height}
          style={{
            width: '100%',
            height: '100%',
            position: 'absolute',
            top: 0,
            left: 0,
          }}
        />
      </div>
    </div>
  );
};

export default CameraWithPoseClient;
