'use client';

import CameraWithPoseClient from './CameraWithPoseClient';

export default function Home() {
  return (
    <main style={{ padding: 20 }}>
      <h1>Real-Time Body Pose Detection <a href="https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker"> (model link)</a></h1>

      <CameraWithPoseClient />
    </main>
  );
}
