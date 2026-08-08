// Installed-artifact baselines (design/0005-agent-audience/): at install
// time, Ward records a content hash of each artifact it put in place, so a
// future upgrade can tell customized from untouched
// (intent/01-concepts/06-workspace-lifecycle.md, divergence must be
// detectable). Detection answers "changed or not" — it is not
// tamper-evidence, and it is sized accordingly: one sha256 per artifact.

/** sha256 of a file's exact bytes, hex-encoded — the baseline fingerprint. */
export async function sha256OfFile(path: string): Promise<string> {
  const bytes = await Bun.file(path).bytes();
  return new Bun.CryptoHasher('sha256').update(bytes).digest('hex');
}
