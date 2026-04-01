# backend/plugins/manager.py

import importlib
import pkgutil
import os
from typing import Dict
from backend.plugins.base import ToolPlugin

def load_plugins() -> Dict[str, ToolPlugin]:
    plugins: Dict[str, ToolPlugin] = {}

    # Determine the directory of this file
    package_dir = os.path.dirname(__file__)
    package_name = "backend.plugins"

    # Iterate through modules inside backend/plugins/
    for _, module_name, _ in pkgutil.iter_modules([package_dir]):
        if module_name in ("base", "manager"):
            continue

        module = importlib.import_module(f"{package_name}.{module_name}")

        # Find classes that inherit from ToolPlugin
        for attr in dir(module):
            obj = getattr(module, attr)
            if (
                isinstance(obj, type)
                and issubclass(obj, ToolPlugin)
                and obj is not ToolPlugin
            ):
                instance = obj()
                plugins[instance.id] = instance

    return plugins
