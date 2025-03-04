// background.js
// Provide the API key to offscreen if chrome.storage is not accessible there.

let recordingStarted = false;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.command === "startRecording") {
    startRecordingProcess();
  } else if (msg.command === "stopRecording") {
    stopRecordingProcess();
  } else if (msg.type === "updateRecordingState") {
    chrome.storage.local.set({
      recordingState: {
        isRecording: msg.isRecording,
        duration: msg.duration
      }
    });
  } else if (msg.type === "finalSummary") {
    saveSummaryToHistory(msg.payload);
    chrome.storage.local.set({
      recordingState: { isRecording: false, duration: 0 }
    }, () => {
      chrome.runtime.sendMessage({
        type: "finalSummary",
        payload: msg.payload
      });
      if (chrome.offscreen) chrome.offscreen.closeDocument();
      recordingStarted = false;
    });
  }
  // Offscreen requests API key
  else if (msg.type === "requestApiKey") {
    chrome.storage.local.get("openaiApiKey", (res) => {
      sendResponse({ apiKey: res.openaiApiKey || "" });
    });
    // must return true to handle async response
    return true;
  }
});

async function startRecordingProcess() {
  if (recordingStarted) return;
  const hasOffscreen = await chrome.offscreen.hasDocument();
  if (!hasOffscreen) {
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["DISPLAY_MEDIA"],
      justification: "Recording audio in the background"
    });
  }
  chrome.runtime.sendMessage({ type: "start" });
  recordingStarted = true;
}

async function stopRecordingProcess() {
  if (!recordingStarted) return;
  chrome.runtime.sendMessage({ type: "stop" });
}

// Save final summary to local history
function saveSummaryToHistory(text) {
  chrome.storage.local.get(["summaryHistory"], (res) => {
    const existing = Array.isArray(res.summaryHistory) ? res.summaryHistory : [];
    const timestamp = new Date().toLocaleString();
    existing.push({ summary: text, time: timestamp });
    chrome.storage.local.set({ summaryHistory: existing });
  });
}
