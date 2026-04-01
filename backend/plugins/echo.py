from .base import ToolPlugin

class EchoPlugin(ToolPlugin):
    id = "echo"
    name = "Echo Test"
    category = "debug"

    def run(self, input_path: str, options: dict) -> str:
        # Just return the same file path for now
        return input_path
