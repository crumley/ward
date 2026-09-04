// The installed-artifact lineage (design/0020-deterministic-upgrade/): for
// every artifact Ward installs, the full history of the default content the
// binary ever shipped — so an upgrade can tell an artifact that is merely OLD
// (its bytes match some historical default: nobody ever touched it) from one
// that is CUSTOMIZED (its bytes match no default Ward ever wrote). This is
// what makes the deterministic upgrade possible on a workspace whose
// baselines document is empty: converge fingerprints only what it itself
// establishes, so a workspace created before 0005 — or converged over — has
// no per-artifact baseline exactly where the upgrade needs the answer, and
// the lineage is the answer's other source.
//
// Representation: HISTORICAL defaults are carried as sha256 fingerprints, not
// full texts — detection only ever asks "equal or not" (0005 sized detection
// at one sha256 per artifact, and this is the same question against more
// candidates), the exact texts remain recoverable from this repository's own
// git history (each entry names its introducing commit), and shipping dead
// texts in the binary would be content nothing reads. The CURRENT default is
// the exception: its text ships anyway (templates.ts installs it), so the
// lineage derives it — and its hash — from the very constants creation
// installs, one source of truth that cannot drift from what create writes.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { renderDocument } from '../store/document.ts';
import { catalogType, seededArtifactTypes } from '../store/types.ts';
import { sha256OfFile } from './baselines.ts';
import { AGENTS_MD, CATALOG_BODY, WARD_INTERNAL_README } from './templates.ts';

/** One superseded default: the exact bytes some older ward installed, hashed. */
export interface DefaultVersion {
  readonly sha256: string;
  /** Where the bytes came from: the introducing commit and its design entry. */
  readonly era: string;
}

export interface ArtifactLineage {
  /** Workspace-relative path of the installed artifact. */
  readonly path: string;
  /** The default as THIS build installs it — the exact bytes creation writes. */
  readonly current: () => string;
  /**
   * Every superseded default, oldest first. Maintained by hand, guarded by
   * test: when templates.ts (or the catalog seed) changes, the outgoing
   * default's hash MUST be appended here, or a workspace still carrying it
   * would read as customized and the upgrade would stop touching it.
   */
  readonly history: readonly DefaultVersion[];
}

/** sha256 of exact text bytes — the same fingerprint baselines record. */
export function sha256OfText(text: string): string {
  return new Bun.CryptoHasher('sha256').update(text).digest('hex');
}

/** The catalog document exactly as creation would write it today. */
function currentCatalogText(): string {
  return renderDocument(catalogType, {
    data: { type: 'catalog', artifactTypes: seededArtifactTypes },
    body: CATALOG_BODY,
  });
}

/**
 * The lineage of every installed artifact, in the order creation installs
 * them. The historical hashes were recovered from this repository's own git
 * history (design/0020-deterministic-upgrade/, build log: the archaeology and
 * its proving commands); each era names the commit that shipped those bytes.
 */
export const INSTALLED_ARTIFACT_LINEAGE: readonly ArtifactLineage[] = [
  {
    path: '.ward/README.md',
    current: () => WARD_INTERNAL_README,
    history: [
      // a71b091 (design 0002) — "staging area for atomic writes, and locks
      // when they become necessary". The bytes standing in the live bootstrap
      // workspace's .ward/README.md.
      {
        sha256: '7304394516ae3f013223a7e6daa986c8f15d2141e051be4aa4dfba8ede790bd4',
        era: 'a71b091 (design 0002)',
      },
      // fd72287 (design 0005) — grew the baselines mention.
      {
        sha256: '606af55f9079b279e5be3702fec24c138eb23601f0539aeb2d6c291b4c748ae9',
        era: 'fd72287 (design 0005)',
      },
      // Current since 65f1e8b (design 0013): store lock + telemetry.
    ],
  },
  {
    path: 'catalog.md',
    current: currentCatalogText,
    history: [
      // One default ever: the seeded catalog has been byte-stable since
      // a71b091 (design 0002).
    ],
  },
  {
    path: 'AGENTS.md',
    current: () => AGENTS_MD,
    history: [
      {
        sha256: '7852834fb1a4d554e7ccf998a5ae3bc7d67fc0caba50f8d625e6ec20f49fc1bc',
        era: 'a71b091 (design 0002)',
      },
      {
        sha256: 'f856a1c28c6475e4339175ed17d6087ed2c17d19b2489c90a70a223318487d30',
        era: 'd5336c3 (design 0003)',
      },
      // c7962cc (design 0004) — the bytes standing in the live bootstrap
      // workspace's untouched AGENTS.md (created 2026-08-05, pre-0005).
      {
        sha256: '05eaa2760ce0320e7eca739dd9a497a9a86f10346023451186113ab1ce71750f',
        era: 'c7962cc (design 0004)',
      },
      {
        sha256: '7327254db66e98bc51137982e6ef80ab8dd8f17be230dfa064548272956aa705',
        era: 'fd72287 (design 0005)',
      },
      {
        sha256: 'aeb3ab0f31632f8532a3c234ccdfd9846476ac67688bf540dfde3043487ad9ba',
        era: 'bdd3363 (design 0008)',
      },
      {
        sha256: '3579588599476b00014fa0caed25b7ebefa85ab335b8ba3ed3bbb3e882d669cc',
        era: '5f0d4be (design 0006)',
      },
      {
        sha256: 'a2e769d576363700b8b87cbd260d8cf1dd7deff25a4f185862b8a075f5765c85',
        era: '3a9e4e0 (design 0011)',
      },
      {
        sha256: 'ccacbf3aa5800e843b13809329a7760b0a13dfc39d2ce60428353b9fde6e31e2',
        era: '65f1e8b (design 0013)',
      },
      {
        sha256: '01cefb8025e88031b2a6cd5131d66b0072ee63ceade27dcf7b4319b39806210c',
        era: '2d83363 (design 0017)',
      },
      {
        sha256: 'fe28bfc7710be5046edd1c8711e6d9d87f73ef0f08722b5898ecb5529430a1c1',
        era: 'f8cb17b (design 0015)',
      },
      {
        sha256: 'de4ee8439b3a8eab3851e7109b22a2542d41337b46efb0d0e16be7a36fc7b24b',
        era: '94e6890 (design 0018)',
      },
      // 7fa9656 (design 0029) — the Sessions section: sessions are opened BY
      // ward, which launches the agent, assigns the handle, and sets
      // WARD_AGENT; resume, locate, where the agent configuration lives, and
      // the manual --handle path for a session ward did not start.
      {
        sha256: 'ef5ffe607886ca2fea68c54f7cf72a138c5058316116b49a78d664ffa58ac510',
        era: '7fa9656 (design 0029)',
      },
      // b85124f (design 0034) — `--purpose` optional at workspace scope; the
      // manifest named the omitted purpose as 'interactive workspace session'.
      {
        sha256: 'c3632671f68f052cbe4449e81bf38618ca8a379ead3f500fae2b4346846ceefd',
        era: 'b85124f (design 0034)',
      },
      // be13037 (design 0034, follow-up) — an omitted purpose is recorded as
      // `Coordinating work · opened <time>`, and the manifest says so.
      {
        sha256: '2a2fdc448ac6ee2bd765f4056c90f47c15aa175662e55a568430bf08de84cb63',
        era: 'be13037 (design 0034)',
      },
      // design 0035 — `agent.command` joined the configuration keys the
      // Sessions section names, and doctor checks the command can be found.
      {
        sha256: '2af9f23552c0458877124333ca4fe413517257a3ba0d2e1b3dad363ff8d578f4',
        era: 'design 0035 (agent.command)',
      },
      // design 0036 — tasks are addressed `f<floor>t<room>`, the agent passes
      // the full address and reads it from `address` in --json, and the
      // glanceable listings hide settled work behind `--all`; the Sessions
      // section still said nothing about which machine a session ran on.
      {
        sha256: '146730f74a5f509e85bff76aa56c93e9eb70272212a63cbdbc03062cb251fd4d',
        era: 'design 0036 (task address)',
      },
      // design 0038 — session ids carry the machine and never reuse a number,
      // resume refuses a history another machine holds, `ward status` lists
      // the open workspace sessions, and the exit question is named with its
      // `--on-exit` pre-answer; floors could not yet claim repositories.
      {
        sha256: '56e5346e859eb390249c93f3c32d096a6ef732c1033fdd5af3bdbc294d300d27',
        era: 'design 0038 (machine-bound sessions)',
      },
      // Current since design 0037: a floor may claim repositories as a routing
      // default, `task open --repo` records and places, and `worktree create`
      // reads the task's single recorded repository.
    ],
  },
];

/**
 * How an on-disk artifact stands against its lineage:
 * - `current` — byte-identical to the default this build installs.
 * - `stale` — matches a historical default (or the fingerprint recorded at
 *   install): Ward wrote every byte, nobody touched it since — merely old,
 *   and the upgrade may replace it mechanically.
 * - `customized` — matches nothing Ward ever wrote: the yours-tier working
 *   as intended, and exactly what the upgrade must leave byte-untouched.
 * - `missing` — not on disk at all.
 */
export type ArtifactStanding = 'current' | 'stale' | 'customized' | 'missing';

export interface ArtifactClassification {
  readonly standing: ArtifactStanding;
  /** The era whose default the bytes match — present exactly when `stale`. */
  readonly era?: string;
}

/**
 * Classify one installed artifact at `root`. `baselineSha` is the fingerprint
 * the baselines document recorded at install time, when it has one: bytes
 * matching it were written by Ward even if they match no shipped default this
 * lineage knows (a defensive widening — today every baseline hash is also a
 * lineage hash). Absence of both matches reads as customized: the safe
 * direction, an artifact never mechanically overwritten on a guess (0005).
 */
export async function classifyArtifact(
  root: string,
  lineage: ArtifactLineage,
  baselineSha?: string,
): Promise<ArtifactClassification> {
  const file = join(root, lineage.path);
  if (!existsSync(file)) return { standing: 'missing' };
  const sha = await sha256OfFile(file);
  if (sha === sha256OfText(lineage.current())) return { standing: 'current' };
  const match = lineage.history.find((version) => version.sha256 === sha);
  if (match !== undefined) return { standing: 'stale', era: match.era };
  if (baselineSha !== undefined && sha === baselineSha) {
    return { standing: 'stale', era: 'the default recorded at install' };
  }
  return { standing: 'customized' };
}
