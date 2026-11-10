import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class ConfigCompatibilityTests(unittest.TestCase):
    def test_windows_prefix_and_mac_layout_bindings_coexist(self):
        keys = json.loads((ROOT / "keys.json").read_text())
        self.assertEqual(keys["global"]["ctrl-1"], "tab.select:1")
        self.assertEqual(keys["layout:traveler"]["ctrl-b"], "traveler-tabs.prefix")
        self.assertEqual(keys["layout:user-main"]["ctrl-b"], "user-tabs.prefix")
        self.assertEqual(keys["global"]["cmd-1"], "tab.select:1")
        self.assertEqual(keys["layout:pixel-art"]["ctrl-1"], "space.select:1")
        self.assertEqual(keys["layout:pixel-art"]["ctrl-b x"], "mod.open:confirm-close-pane")
        self.assertNotIn("alt-left", keys["terminal"])
        self.assertEqual(keys["layout:pixel-art"]["alt-left"], "send:\u001bb")

    def test_opencode_install_and_export_with_special_path_characters(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            repo = root / "repo"
            (repo / "scripts").mkdir(parents=True)
            shutil.copy(ROOT / "scripts/sync-opencode.sh", repo / "scripts")
            shutil.copytree(ROOT / "opencode", repo / "opencode")
            config_home = root / "config with spaces & apostrophe's # folder"
            live = config_home / "opencode"
            live.mkdir(parents=True)
            previous = '{"plugins": ["existing-plugin"]}'
            (live / "cli.json").write_text(previous)
            env = {**os.environ, "XDG_CONFIG_HOME": str(config_home)}
            script = str(repo / "scripts/sync-opencode.sh")
            subprocess.run(["bash", script, "install"], env=env, check=True, capture_output=True)
            config = json.loads((live / "cli.json").read_text())
            self.assertIn(str(live / "herdr-cards"), config["plugins"])
            self.assertIn("@slkiser/opencode-quota", config["plugins"])
            self.assertTrue((live / "herdr-cards/tui.js").is_file())
            backups = list(live.glob("cli.json.bak-*"))
            self.assertEqual(len(backups), 1)
            self.assertEqual(backups[0].read_text(), previous)
            subprocess.run(["bash", script, "export"], env=env, check=True, capture_output=True)
            self.assertEqual((repo / "opencode/cli.json").read_bytes(), (live / "cli.json").read_bytes())


if __name__ == "__main__":
    unittest.main()
