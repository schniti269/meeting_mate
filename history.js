document.addEventListener("DOMContentLoaded", () => {
  const historyContainer = document.getElementById("historyContainer");
  const clearBtn = document.getElementById("clearBtn");

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
  addButtonAnimation(clearBtn);

  // Load history entries and apply staggered fade animations
  function loadHistory() {
    chrome.storage.local.get(["summaryHistory"], (res) => {
      const history = Array.isArray(res.summaryHistory) ? res.summaryHistory : [];
      historyContainer.innerHTML = "";
      history.forEach((entry, index) => {
        const entryDiv = document.createElement("div");
        entryDiv.className = "entry";
        entryDiv.style.animation = `entryFade 0.5s ease-out forwards`;
        entryDiv.style.animationDelay = `${index * 0.1}s`;

        const timeDiv = document.createElement("div");
        timeDiv.className = "time";
        timeDiv.textContent = entry.time;

        const summaryDiv = document.createElement("div");
        summaryDiv.textContent = entry.summary;

        entryDiv.appendChild(timeDiv);
        entryDiv.appendChild(summaryDiv);
        historyContainer.appendChild(entryDiv);
      });
    });
  }

  // Clear history with fade-out transition
  clearBtn.addEventListener("click", () => {
    historyContainer.style.transition = "opacity 0.3s";
    historyContainer.style.opacity = "0";
    setTimeout(() => {
      chrome.storage.local.set({ summaryHistory: [] }, loadHistory);
      historyContainer.style.opacity = "1";
    }, 300);
  });

  loadHistory();
});
