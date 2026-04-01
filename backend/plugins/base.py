from typing import Dict, Any

class ToolPlugin:
    id: str = "base"
    name: str = "Base Tool"
    category: str = "general"
    description: str = "No description provided."
    version: str = "1.0.0"
    icon: str = "fa-solid fa-toolbox"

    def run(self, input_path: str, options: Dict[str, Any]) -> str:
        raise NotImplementedError
