// offscreen.js
// Attempt to fix the undefined chrome.storage.local by forcing the extension context
// to load offscreen in extension origin. We'll fetch the API key from background if not available.

let mediaRecorder;
let isRecording = false;
let duration = 0;
let startTime = 0;
let durationInterval;

let recordedChunks = []; // Each chunk is up to 1 min

// We'll store a cachedApiKey if possible
let cachedApiKey = "";

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "start") {
    startRecording();
  } else if (msg.type === "stop") {
    stopRecording();
  } else if (msg.type === "provideApiKey") {
    cachedApiKey = msg.value || "";
  }
});

async function startRecording() {
  if (isRecording) return;
  // Get or request key from background
  let apiKey = await getApiKey();
  if (!apiKey) {
    console.warn("No API key available. Will record but cannot transcribe.");
  }
  recordedChunks = [];

  try {
    // Request display/audio capture
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: {
        sampleRate: 44100,
        echoCancellation: false,
        noiseSuppression: false
      }
    });
    // Immediately stop any video tracks so only audio remains
    stream.getVideoTracks().forEach((track) => track.stop());

    mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        recordedChunks.push(e.data);
      }
    };
    mediaRecorder.onerror = (err) => console.error("MediaRecorder error:", err);

    // timeslice=60000 => every 1 min we get a chunk
    mediaRecorder.start(60_000);

    startTime = Date.now();
    startDurationTimer();
    isRecording = true;
    sendRecordingState(true, 0);
    console.log("[Offscreen] Recording started.");
  } catch (err) {
    console.error("Error starting recording:", err);
  }
}

function stopRecording() {
  if (!isRecording || !mediaRecorder) return;
  console.log("[Offscreen] Stop recording.");

  mediaRecorder.onstop = async () => {
    stopDurationTimer();
    sendRecordingState(false, 0);
    console.log("[Offscreen] Recorder stopped. Processing chunks...");

    let apiKey = await getApiKey();
    let allTranscribed = "";

    if (apiKey) {
      for (let i = 0; i < recordedChunks.length; i++) {
        const chunkBlob = recordedChunks[i];
        const chunkText = await transcribeAudio(chunkBlob, apiKey);
        allTranscribed += chunkText + " ";
      }
    } else {
      console.warn("No API key found. Cannot transcribe audio.");
    }

    recordedChunks = [];
    if (mediaRecorder.stream) {
      mediaRecorder.stream.getTracks().forEach((track) => track.stop());
    }
    isRecording = false;

    let finalSummary = allTranscribed.trim();
    if (apiKey && finalSummary) {
      finalSummary = await summarizeText(finalSummary, apiKey);
    }
    if (!finalSummary) {
      finalSummary = "No transcript / summary available.";
    }

    chrome.runtime.sendMessage({
      type: "finalSummary",
      payload: finalSummary
    });
  };

  mediaRecorder.stop();
}

function startDurationTimer() {
  durationInterval = setInterval(() => {
    if (!isRecording) return;
    duration = Math.floor((Date.now() - startTime) / 1000);
    sendRecordingState(true, duration);
  }, 1000);
}

function stopDurationTimer() {
  clearInterval(durationInterval);
  durationInterval = null;
  duration = 0;
}

function sendRecordingState(isRec, dur) {
  chrome.runtime.sendMessage({
    type: "updateRecordingState",
    isRecording: isRec,
    duration: dur
  });
}

async function getApiKey() {
  // If we have it cached, use that
  if (cachedApiKey) return cachedApiKey;
  // Otherwise, request from background
  const keyFromBg = await new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "requestApiKey" }, (response) => {
      resolve(response?.apiKey || "");
    });
  });
  cachedApiKey = keyFromBg;
  return keyFromBg;
}

async function transcribeAudio(blob, apiKey) {
  const formData = new FormData();
  formData.append("file", blob, "audio.webm");
  formData.append("model", "whisper-1");

  try {
    const resp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      body: formData
    });
    const data = await resp.json();
    if (!resp.ok) {
      console.error("Transcription error:", data);
      return "";
    }
    return data.text || "";
  } catch (err) {
    console.error("Transcription fetch error:", err);
    return "";
  }
}

async function summarizeText(text, apiKey) {
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a concise summarizer." },
          {
            role: "user",
            content: text
          }
        ],
        temperature: 0.5
      })
    });
    const data = await resp.json();
    if (!resp.ok) {
      console.error("Summarization error:", data);
      return text;
    }
    const summary = data.choices?.[0]?.message?.content;
    return summary || text;
  } catch (err) {
    console.error("Summarization fetch error:", err);
    return text;
  }
}
