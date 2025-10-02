from pathlib import Path
path = Path(r"c:\git\GeoCraft\src\renderer.tsx")
lines = path.read_text(encoding="utf-8").splitlines()
insert_idx = next((i for i, line in enumerate(lines) if line.strip().startswith("const handleConnect = async () => {")), None)
if insert_idx is None:
    raise SystemExit('handleConnect not found')
block = [
    "  useEffect(() => {",
    "    const selectedTool = toolSettings.find((tool) => tool.id === selectedToolId);",
    "    if (selectedTool) {",
    "      setToolDiameter(selectedTool.diameter);",
    "    } else if (toolSettings.length > 0 && selectedToolId !== toolSettings[0].id) {",
    "      setSelectedToolId(toolSettings[0].id);",
    "    }",
    "  }, [selectedToolId, toolSettings]);",
    "",
    "  useEffect(() => {",
    "    const selectedMaterial = materialSettings.find((material) => material.id === selectedMaterialId);",
    "    if (selectedMaterial) {",
    "      setFeedRate(selectedMaterial.feedRate);",
    "      setStepDown(-Math.abs(selectedMaterial.depthPerPass));",
    "    } else if (materialSettings.length > 0 && selectedMaterialId !== materialSettings[0].id) {",
    "      setSelectedMaterialId(materialSettings[0].id);",
    "    }",
    "  }, [selectedMaterialId, materialSettings]);",
    "",
    "  useEffect(() => {",
    "    const loadSettings = async () => {",
    "      try {",
    "        const stored: PersistedSettings = await window.electronAPI.getSettings();",
    "",
    "        if (stored.materialSettings && stored.materialSettings.length > 0) {",
    "          setMaterialSettings(stored.materialSettings);",
    "          if (stored.selectedMaterialId and stored.materialSettings and any(m.id == stored.selectedMaterialId for m in stored.materialSettings)):",
    "            pass",
    "",
    "      except Exception as error:",
    "        print('Failed to load settings', error)",
    "",
    "    loadSettings();",
    "  }, []);"
]
