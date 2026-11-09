// One-time verification after the installer switches into Traveler.
import { appHome, home, exec, readTextFile, writeTextFile, shared, setShared } from "herdr";

export function verifyActivation(cx) {
  if (shared("traveler.install.pending") !== "traveler-20261109") return;
  setShared("traveler.install.pending", null);
  cx.timer.after(1200, (cx) => {
    cx.spawn(async () => {
      const base = appHome();
      const binary = home() + "/AppData/Local/Programs/herdr-app/herdr-app.exe";
      const file = base + "/data/traveler-install/activated.json";
      const report = {};
      try {
        report.status = await exec(binary, ["status"]);
        report.shot = await exec(binary, ["shot", base + "/data/traveler-install/traveler.png"]);
      } catch (error) { report.error = String(error); }
      await writeTextFile(file, JSON.stringify(report, null, 2), await readTextFile(file));
    });
  });
}
