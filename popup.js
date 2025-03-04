document.addEventListener("DOMContentLoaded", () => {
  const startBtn = document.getElementById("startBtn");
  const stopBtn = document.getElementById("stopBtn");
  const statusEl = document.getElementById("status");
  const durationEl = document.getElementById("duration");
  const finalSummaryEl = document.getElementById("finalSummary");
  const historyBtn = document.getElementById("historyBtn");
  const optionsBtn = document.getElementById("optionsBtn");

  // Reusable button animation function
  function addButtonAnimation(button) {
    button.addEventListener("click", () => {
      button.style.transition = "transform 0.1s";
      button.style.transform = "scale(0.95)";
      setTimeout(() => {
        button.style.transform = "scale(1)";
      }, 100);
    });
  }

  // Apply animation to all buttons in this popup
  document.querySelectorAll("button").forEach(addButtonAnimation);

  // Update UI based on recording state
  function updateUI(isRecording, duration) {
    startBtn.disabled = isRecording;
    stopBtn.disabled = !isRecording;
    statusEl.textContent = isRecording ? "Recording..." : "Idle";
    durationEl.textContent = `Duration: ${duration || 0}s`;
  }

  // Initialize state from storage
  chrome.storage.local.get("recordingState", (res) => {
    const state = res.recordingState || { isRecording: false, duration: 0 };
    updateUI(state.isRecording, state.duration);
  });

  // Listen for storage changes
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.recordingState) {
      const newState = changes.recordingState.newValue;
      updateUI(newState.isRecording, newState.duration);
    }
  });

  // Listen for final summary message from background
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "finalSummary") {
      finalSummaryEl.textContent = "Final Summary: " + msg.payload;
    }
  });

  // Button event listeners
  startBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ command: "startRecording" });
  });

  stopBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ command: "stopRecording" });
  });

  historyBtn.addEventListener("click", () => {
    chrome.tabs.create({ url: "history.html" });
  });

  optionsBtn.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });
});
