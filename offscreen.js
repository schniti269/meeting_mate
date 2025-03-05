// offscreen.js

let mediaRecorder;
let isRecording = false;
let duration = 0;
let startTime = 0;
let durationInterval;
let recordedChunks = []; // Each chunk is ~1 minute
let cachedApiKey = "";

// Listen for messages to start/stop or receive API key
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
  let apiKey = await getApiKey();
  if (!apiKey) {
    console.warn("No API key available. Will record but cannot transcribe.");
  }
  recordedChunks = [];

  try {
    // Request display capture with audio; immediately stop video tracks.
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: {
        sampleRate: 44100,
        echoCancellation: false,
        noiseSuppression: false
      }
    });
    stream.getVideoTracks().forEach((track) => track.stop());

    mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        recordedChunks.push(e.data);
      }
    };
    mediaRecorder.onerror = (err) => console.error("MediaRecorder error:", err);

    // Start recording with a timeslice of 60 seconds.
    mediaRecorder.start(60000);
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
    let fullTranscript = "";

    // Process each recorded audio chunk separately.
    if (apiKey) {
      for (let i = 0; i < recordedChunks.length; i++) {
        const chunkBlob = recordedChunks[i];
        const chunkText = await transcribeAudio(chunkBlob, apiKey);
        fullTranscript += chunkText + " ";
      }
    } else {
      console.warn("No API key found. Cannot transcribe audio.");
    }

    recordedChunks = [];
    if (mediaRecorder.stream) {
      mediaRecorder.stream.getTracks().forEach((track) => track.stop());
    }
    isRecording = false;

    let finalSummary = fullTranscript.trim();
    // Use iterative summarization to reduce text to 500 words or fewer.
    if (apiKey && finalSummary) {
      finalSummary = await iterativeSummarize(finalSummary, apiKey, 500);
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
  if (cachedApiKey) return cachedApiKey;
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
      // Return an empty string on error
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
          { role: "system", content: "You are a concise summarizer for Meeting, you will be given a transcript of speech" },
          { role: "user", content: text }
        ],
        temperature: 0.8
      })
    });
    const data = await resp.json();
    if (!resp.ok) {
      return text;
    }
    const summary = data.choices?.[0]?.message?.content;
    return summary || text;
  } catch (err) {
    console.error("Summarization fetch error:", err);
    return text;
  }
}
// Recursively summarize text until it fits within maxWords,
// but always perform at least one summarization pass.
async function iterativeSummarize(text, apiKey, maxWords, iteration = 0) {
  // After the first summarization, if the text is concise enough, stop.
  if (iteration > 0 && wordCount(text) <= maxWords) return text;
  
  // Split text into chunks of maxWords words each.
  const chunks = splitTextIntoChunks(text, maxWords);
  let summarizedChunks = [];
  for (const chunk of chunks) {
    const summary = await summarizeText(chunk, apiKey);
    summarizedChunks.push(summary);
  }
  
  const combinedSummary = summarizedChunks.join(" ");
  
  // Prevent infinite loops: if no reduction is made or after several iterations, return.
  if (iteration >= 5 || wordCount(combinedSummary) >= wordCount(text)) {
    return combinedSummary;
  }
  
  return await iterativeSummarize(combinedSummary, apiKey, maxWords, iteration + 1);
}

// Helper: Count words in a text
function wordCount(text) {
  return text.trim().split(/\s+/).length;
}

// Helper: Split text into chunks of maxWords words each
function splitTextIntoChunks(text, maxWords) {
  const words = text.trim().split(/\s+/);
  let chunks = [];
  for (let i = 0; i < words.length; i += maxWords) {
    chunks.push(words.slice(i, i + maxWords).join(" "));
  }
  return chunks;
}
