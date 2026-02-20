import '@tensorflow/tfjs';
import * as blazeface from '@tensorflow-models/blazeface';

let model = null;

export const loadModel = async () => {
    try {
        if (!model) {
            console.log("Loading Blazeface model...");
            model = await blazeface.load();
            console.log("Model loaded.");
        }
        return model;
    } catch (err) {
        console.error("Failed to load model", err);
        return null;
    }
};

export const detectAttention = async (videoElement) => {
    if (!model || !videoElement || videoElement.readyState !== 4) return null;

    try {
        const predictions = await model.estimateFaces(videoElement, false);
        // Prediction format: [{ topLeft, bottomRight, landmarks, probability }]

        if (predictions.length > 0) {
            // Case 1: Multiple people in frame (cheating/distraction)
            if (predictions.length > 1) {
                console.log("Inattentive: Multiple faces detected");
                return false;
            }

            const face = predictions[0];

            // Unpack face corners
            const topLeft = face.topLeft;
            const bottomRight = face.bottomRight;
            const faceWidth = bottomRight[0] - topLeft[0];
            const faceHeight = bottomRight[1] - topLeft[1];

            const videoWidth = videoElement.videoWidth;
            const videoHeight = videoElement.videoHeight;

            // Case 2: Face is out of bounds (partially off-screen)
            // If the bounding box is too close to the video borders
            if (topLeft[0] < 0 || topLeft[1] < 0 || bottomRight[0] > videoWidth || bottomRight[1] > videoHeight) {
                console.log("Inattentive: Face partially off-screen");
                return false;
            }

            // Case 3: Face area too small (Student is too far away from the webcam)
            const faceArea = faceWidth * faceHeight;
            const videoArea = videoWidth * videoHeight;
            const screenCoverage = (faceArea / videoArea) * 100;

            if (screenCoverage < 3.0) { // e.g., less than 3% of the screen
                console.log("Inattentive: Student is too far away (Screen coverage:", screenCoverage.toFixed(2), "%)");
                return false;
            }

            // Case 4: Face area too large (Student is too close / covering camera)
            if (screenCoverage > 60.0) {
                console.log("Inattentive: Student is too close to camera (Screen coverage:", screenCoverage.toFixed(2), "%)");
                return false;
            }

            const landmarks = face.landmarks;
            if (!landmarks || landmarks.length < 6) return true; // Fallback to presence

            // Blazeface landmarks:
            // 0: right eye, 1: left eye, 2: nose, 3: mouth, 4: right ear, 5: left ear
            const rightEye = landmarks[0];
            const leftEye = landmarks[1];
            const nose = landmarks[2];
            const mouth = landmarks[3];

            const rightEyeX = rightEye[0];
            const leftEyeX = leftEye[0];
            const noseX = nose[0];

            // Case 5: Sideways Detection (Yaw)
            const rightDist = Math.abs(noseX - rightEyeX);
            const leftDist = Math.abs(noseX - leftEyeX);

            const horizontalRatio = Math.max(rightDist, 1) / Math.max(leftDist, 1);

            if (horizontalRatio > 2.0 || horizontalRatio < 0.5) {
                console.log("Inattentive: Looking sideways (Ratio:", horizontalRatio.toFixed(2), ")");
                return false;
            }

            // Case 6: Up/Down Detection (Pitch)
            const eyesCenterY = (rightEye[1] + leftEye[1]) / 2;
            const noseY = nose[1];
            const mouthY = mouth[1];

            const eyesToNoseY = Math.abs(noseY - eyesCenterY);
            const noseToMouthY = Math.abs(mouthY - noseY);

            const verticalRatio = Math.max(eyesToNoseY, 1) / Math.max(noseToMouthY, 1);

            if (verticalRatio > 2.2 || verticalRatio < 0.6) {
                console.log("Inattentive: Looking up or down (Ratio:", verticalRatio.toFixed(2), ")");
                return false;
            }

            // Case 7: Head tilt (Roll) - Eyes are not horizontally aligned
            const eyeDrop = Math.abs(rightEye[1] - leftEye[1]);
            const eyeDistance = Math.abs(rightEyeX - leftEyeX);
            const tiltAngle = Math.atan2(eyeDrop, eyeDistance) * (180 / Math.PI);

            if (tiltAngle > 25) { // Head tilted more than 25 degrees
                console.log("Inattentive: Head tilted severely (Angle:", tiltAngle.toFixed(2), "degrees)");
                return false;
            }

            return true; // Face present, central, and looking directly at screen = Attentive
        } else {
            console.log("Inattentive: No face detected");
            return false; // No face = Inattentive
        }
    } catch (err) {
        console.error("Detection error:", err);
        return null;
    }
};
