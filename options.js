document.addEventListener("DOMContentLoaded", () => {
  const apiKeyInput = document.getElementById("apiKey");
  const saveBtn = document.getElementById("saveBtn");
  const statusMsg = document.getElementById("statusMsg");

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
  addButtonAnimation(saveBtn);

  // Load existing API key from storage
  chrome.storage.local.get(["openaiApiKey"], (res) => {
    if (res.openaiApiKey) {
      apiKeyInput.value = res.openaiApiKey;
    }
  });

  // Save API key and display feedback
  saveBtn.addEventListener("click", () => {
    const key = apiKeyInput.value.trim();
    chrome.storage.local.set({ openaiApiKey: key }, () => {
      statusMsg.textContent = "API key saved successfully.";
      setTimeout(() => { statusMsg.textContent = ""; }, 1500);
    });
  });
});
