document.addEventListener("DOMContentLoaded", () => {
  const tabs = document.querySelectorAll(".tab-btn");
  const toolsPanel = document.querySelector(".tools-panel");
  const workspacePanel = document.querySelector(".workspace-panel");

  if (!tabs.length || !toolsPanel || !workspacePanel) return;

  tabs.forEach(btn => {
    btn.addEventListener("click", () => {
      tabs.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      const panel = btn.dataset.panel;

      toolsPanel.classList.toggle("active", panel === "tools");
      workspacePanel.classList.toggle("active", panel === "workspace");
    });
  });
});
