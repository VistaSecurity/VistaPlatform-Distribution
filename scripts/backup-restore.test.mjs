// Self-test for backup.sh and restore.sh, run with a stub `docker` on PATH:
//
//   node --test scripts/backup-restore.test.mjs
//
// The stub records every docker call and fakes just enough of docker and
// compose for the scripts to run, so the test proves the scripts' LOGIC with no
// images, no daemon and no network: what they refuse (a missing volume or
// archive, a damaged backup, a changed encryption key, an existing install),
// and the order they run the documented commands in. Each rule is checked in
// both polarities: the good case passes and the defect is refused. The scripts
// are also checked against deliberately broken copies of themselves, which the
// same scenarios must catch.
//
// This does not prove the commands work against a real PostgreSQL and real
// volumes; that was proved once by hand (the recovery procedure INSTALL.md
// documents), not by this test.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// A bash stub for `docker`. State comes from the environment:
//   STUB_LOG       file every call is appended to, one line each
//   STUB_DIR       scratch directory (captured stdin)
//   STUB_PROJECT   the compose project name `config` reports
//   STUB_PG        "1" when the postgres service is running
//   STUB_VOLUMES   space-separated volume names that exist
const STUB = String.raw`#!/usr/bin/env bash
echo "$*" >> "$STUB_LOG"
n=$(wc -l < "$STUB_LOG")
case "$1" in
  compose)
    shift
    # skip -f F, --env-file E, -p P
    while [ $# -gt 0 ]; do case "$1" in -f|--env-file|-p) shift 2 ;; *) break ;; esac; done
    case "$1" in
      config) echo "name: @{STUB_PROJECT:-vista}"; echo "services: {}" ;;
      version) echo "2.40.0" ;;
      ps) if [ "$2" = "-q" ] && [ "$3" = "postgres" ]; then [ "@{STUB_PG:-1}" = 1 ] && echo "pgcontainer123"; exit 0
          elif [ "$2" = "-aq" ]; then [ -n "@{STUB_CONTAINERS:-}" ] && echo "c1"; exit 0; fi ;;
      exec)
        # exec -T postgres <tool> ...
        tool="$4"
        case "$tool" in
          pg_dump) printf 'PGDMP-stub-dump' ;;
          pg_dumpall) printf 'CREATE ROLE crypto_user;\nALTER ROLE crypto_user WITH SUPERUSER;\nCREATE ROLE crypto_app;\nCREATE ROLE crypto_bypass;\n' ;;
          pg_isready) exit 0 ;;
          psql|pg_restore) cat > "$STUB_DIR/stdin.$n.$tool" ;;
        esac ;;
      up|down) ;;
    esac ;;
  inspect) echo "postgres:17-stub" ;;
  volume)
    case "$2" in
      inspect) for v in @{STUB_VOLUMES:-}; do [ "$v" = "$3" ] && exit 0; done; exit 1 ;;
      create) ;;
    esac ;;
  run)
    # run --rm [-i] -v A:B IMAGE tar -C /v (-czf|-xzf) - ...: the archive goes through stdout or stdin
    case "$*" in *"-czf - "*) printf 'tgz-stub' ;; *"-xzf -"*) cat > /dev/null ;; esac ;;
esac
exit 0
`.replaceAll('@{', '$' + '{');

// Substrings that mark a call as one that changes something.
const MUTATING = [/^compose .* up /, /^compose .* down /, / exec -T postgres (pg_dump|pg_dumpall|psql|pg_restore) /, /^volume create /, /^run .* tar .* -xzf /, /^run .* tar .* -czf /];

class Rig {
  constructor(scriptsDir) {
    this.root = mkdtempSync(path.join(tmpdir(), 'vista-br-'));
    this.bin = path.join(this.root, 'bin');
    this.work = path.join(this.root, 'work');
    this.stubDir = path.join(this.root, 'stub');
    this.log = path.join(this.root, 'docker.log');
    for (const d of [this.bin, this.work, this.stubDir]) mkdirSync(d, { recursive: true });
    writeFileSync(path.join(this.bin, 'docker'), STUB);
    chmodSync(path.join(this.bin, 'docker'), 0o755);
    writeFileSync(this.log, '');
    writeFileSync(path.join(this.work, 'compose.yaml'), 'services: {}\n');
    writeFileSync(path.join(this.work, '.env'), 'POSTGRES_PASSWORD=p\nENCRYPTION_MASTER_KEY=key-one\n');
    this.scripts = scriptsDir;
  }
  run(script, args, env = {}) {
    const r = spawnSync('bash', [path.join(this.scripts, script), ...args], {
      cwd: this.work,
      encoding: 'utf8',
      env: {
        PATH: `${this.bin}:${process.env.PATH}`, HOME: this.root, STUB_LOG: this.log, STUB_DIR: this.stubDir,
        STUB_PG: '1', STUB_VOLUMES: 'vista_sensor_manager_agent_tls vista_device_interrogation_agent_tls', ...env,
      },
    });
    return { status: r.status, out: r.stdout + r.stderr };
  }
  calls() { return readFileSync(this.log, 'utf8').split('\n').filter(Boolean); }
  mutating() { return this.calls().filter((c) => MUTATING.some((re) => re.test(c))); }
  index(re) { return this.calls().findIndex((c) => re.test(c)); }
  clearLog() { writeFileSync(this.log, ''); }
  stdinOf(tool) {
    const f = readdirSync(this.stubDir).find((n) => n.endsWith(`.${tool}`));
    return f ? readFileSync(path.join(this.stubDir, f), 'utf8') : null;
  }
  done() { rmSync(this.root, { recursive: true, force: true }); }
}

// Takes a backup with the rig and returns its directory (whatever state it is in).
function takeBackup(rig) {
  const dir = path.join(rig.root, 'bk');
  rig.run('backup.sh', ['--out', dir]); // a broken backup.sh is caught by the backup scenarios
  return dir;
}

// Each scenario returns [] when the script behaves as documented, or a list of
// what is wrong. The same scenarios run on the real scripts (must be empty) and
// on broken copies (must not be).
function scenarios(scriptsDir) {
  const bad = [];
  const expect = (cond, what) => { if (!cond) bad.push(what); };
  const withRig = (fn) => { const rig = new Rig(scriptsDir); try { fn(rig); } finally { rig.done(); } };

  // --- backup ---------------------------------------------------------------
  withRig((rig) => {
    const dir = path.join(rig.root, 'bk');
    const r = rig.run('backup.sh', ['--out', dir]);
    expect(r.status === 0, `backup: a full set backs up (exit ${r.status}: ${r.out})`);
    const files = existsSync(dir) ? readdirSync(dir).sort().join(' ') : '(none)';
    expect(files === 'SHA256SUMS database.dump device_interrogation_agent_tls.tgz env globals.sql sensor_manager_agent_tls.tgz',
      `backup: writes the dump, the roles, both TLS archives, env and checksums (got: ${files})`);
    const dump = rig.index(/pg_dump -U crypto_user -d crypto_inventory -Fc/);
    const roles = rig.index(/pg_dumpall -U crypto_user --globals-only/);
    const tls1 = rig.index(/vista_sensor_manager_agent_tls:\/v:ro .* -czf -/);
    const tls2 = rig.index(/vista_device_interrogation_agent_tls:\/v:ro .* -czf -/);
    expect(dump >= 0 && roles > dump && tls1 > roles && tls2 > tls1, `backup: dump, then roles, then both volumes (${dump} ${roles} ${tls1} ${tls2})`);
    expect(rig.calls().some((c) => /^run --rm -v vista_sensor_manager_agent_tls:\/v:ro /.test(c)), 'backup: the volumes are mounted read-only');
    const sums = spawnSync('sha256sum', ['-c', 'SHA256SUMS'], { cwd: dir, encoding: 'utf8' });
    expect(sums.status === 0, `backup: SHA256SUMS verifies (${sums.stdout}${sums.stderr})`);
    expect(existsSync(path.join(dir, 'env')) && readFileSync(path.join(dir, 'env'), 'utf8').includes('ENCRYPTION_MASTER_KEY=key-one'), 'backup: keeps .env');
  });

  for (const missing of ['vista_sensor_manager_agent_tls', 'vista_device_interrogation_agent_tls']) {
    withRig((rig) => {
      const dir = path.join(rig.root, 'bk');
      const vols = ['vista_sensor_manager_agent_tls', 'vista_device_interrogation_agent_tls'].filter((v) => v !== missing).join(' ');
      const r = rig.run('backup.sh', ['--out', dir], { STUB_VOLUMES: vols });
      expect(r.status !== 0 && r.out.includes(missing), `backup: refuses when ${missing} does not exist (exit ${r.status})`);
      expect(rig.mutating().length === 0 && !existsSync(dir), `backup: a refusal for ${missing} dumps nothing and writes nothing`);
    });
  }

  withRig((rig) => {
    const r = rig.run('backup.sh', ['--out', path.join(rig.root, 'bk')], { STUB_PG: '0' });
    expect(r.status !== 0 && /not running/.test(r.out) && rig.mutating().length === 0, 'backup: refuses when postgres is not running');
  });

  withRig((rig) => {
    const dir = path.join(rig.root, 'bk');
    mkdirSync(dir);
    const r = rig.run('backup.sh', ['--out', dir]);
    expect(r.status !== 0 && /already exists/.test(r.out) && rig.mutating().length === 0, 'backup: never writes into an existing directory');
  });

  withRig((rig) => {
    const dir = path.join(rig.root, 'bk');
    const r = rig.run('backup.sh', ['--out', dir, '--dry-run']);
    expect(r.status === 0 && rig.mutating().length === 0 && !existsSync(dir), `backup --dry-run changes nothing (exit ${r.status})`);
    expect(/pg_dump/.test(r.out) && /agent_tls|tgz/.test(r.out), 'backup --dry-run says what it would do');
  });

  // --- restore --------------------------------------------------------------
  // A fresh host: the backup is taken with one rig, restored with another.
  const restoreRig = (rig2, bk) => { cpSync(path.join(bk, 'env'), path.join(rig2.work, '.env')); };
  const fullBackup = () => {
    const src = new Rig(scriptsDir);
    const bk = takeBackup(src);
    const kept = mkdtempSync(path.join(tmpdir(), 'vista-br-bk-'));
    cpSync(bk, path.join(kept, 'bk'), { recursive: true });
    src.done();
    return path.join(kept, 'bk');
  };

  {
    const bk = fullBackup();
    try {
      withRig((rig) => {
        restoreRig(rig, bk);
        const r = rig.run('restore.sh', ['--from', bk], { STUB_VOLUMES: '' });
        expect(r.status === 0, `restore: a full set restores into an empty project (exit ${r.status}: ${r.out})`);
        const upPg = rig.index(/compose .*up -d postgres$/);
        const psql = rig.index(/exec -T postgres psql /);
        const pgr = rig.index(/exec -T postgres pg_restore -U crypto_user -d crypto_inventory --exit-on-error/);
        const v1 = rig.index(/^volume create .* vista_sensor_manager_agent_tls$/);
        const x1 = rig.index(/^run .* -v vista_sensor_manager_agent_tls:\/v .* -xzf -/);
        const v2 = rig.index(/^volume create .* vista_device_interrogation_agent_tls$/);
        const x2 = rig.index(/^run .* -v vista_device_interrogation_agent_tls:\/v .* -xzf -/);
        const upAll = rig.index(/compose .* up -d$/); // the first whole-install start
        const order = [upPg, psql, pgr, v1, x1, v2, x2, upAll];
        expect(order.every((n, i) => n >= 0 && (i === 0 || n > order[i - 1])),
          `restore: postgres, roles, pg_restore, both TLS volumes, then up -d, in that order (${order.join(' ')})`);
        const roles = rig.stdinOf('psql') ?? '';
        expect(roles.includes('CREATE ROLE crypto_app') && !/ROLE crypto_user/.test(roles), 'restore: replays the roles except the bootstrap role');
        expect(rig.index(/psql .*ON_ERROR_STOP=1/) >= 0, 'restore: the roles are applied with ON_ERROR_STOP=1');
        expect(rig.stdinOf('pg_restore') === 'PGDMP-stub-dump', 'restore: pg_restore reads the backup\'s dump');
        expect(rig.calls().some((c) => /label com\.docker\.compose\.project=vista /.test(c)), 'restore: labels the volumes it creates as the compose project\'s');
        expect(rig.index(/ down /) === -1, 'restore: an empty project is not torn down');
      });

      // The install exists already.
      withRig((rig) => {
        restoreRig(rig, bk);
        const r = rig.run('restore.sh', ['--from', bk]);
        expect(r.status !== 0 && /refusing/.test(r.out), `restore: refuses over existing volumes without --force (exit ${r.status})`);
        expect(rig.mutating().length === 0, 'restore: that refusal changes nothing');
      });
      withRig((rig) => {
        restoreRig(rig, bk);
        const r = rig.run('restore.sh', ['--from', bk], { STUB_VOLUMES: '', STUB_CONTAINERS: '1' });
        expect(r.status !== 0 && /refusing/.test(r.out) && rig.mutating().length === 0, 'restore: refuses over existing containers without --force');
      });
      withRig((rig) => {
        restoreRig(rig, bk);
        const r = rig.run('restore.sh', ['--from', bk, '--force']);
        expect(r.status === 0, `restore --force proceeds over an existing install (exit ${r.status}: ${r.out})`);
        const down = rig.index(/ down -v$/);
        const upPg = rig.index(/up -d postgres$/);
        expect(down >= 0 && upPg > down, `restore --force: removes the old project first (${down} ${upPg})`);
      });
      withRig((rig) => {
        restoreRig(rig, bk);
        const r = rig.run('restore.sh', ['--from', bk, '--dry-run'], { STUB_VOLUMES: '' });
        expect(r.status === 0 && rig.mutating().length === 0, `restore --dry-run changes nothing (exit ${r.status})`);
        expect(/pg_restore/.test(r.out) && /up -d/.test(r.out), 'restore --dry-run says what it would do');
      });
      withRig((rig) => {
        restoreRig(rig, bk);
        const r = rig.run('restore.sh', ['--from', bk, '--force', '--dry-run']);
        expect(r.status === 0 && rig.mutating().length === 0 && /down -v/.test(r.out), 'restore --force --dry-run names the deletion and does not do it');
      });

      // A different encryption key.
      withRig((rig) => {
        writeFileSync(path.join(rig.work, '.env'), 'POSTGRES_PASSWORD=p\nENCRYPTION_MASTER_KEY=another\n');
        const r = rig.run('restore.sh', ['--from', bk], { STUB_VOLUMES: '' });
        expect(r.status !== 0 && /ENCRYPTION_MASTER_KEY/.test(r.out) && rig.mutating().length === 0, 'restore: refuses a .env whose ENCRYPTION_MASTER_KEY differs from the backup\'s');
      });
      withRig((rig) => {
        rmSync(path.join(rig.work, '.env'));
        const r = rig.run('restore.sh', ['--from', bk], { STUB_VOLUMES: '' });
        expect(r.status !== 0 && rig.mutating().length === 0, 'restore: refuses with no .env');
      });
    } finally {
      rmSync(path.dirname(bk), { recursive: true, force: true });
    }

    // A backup that lacks something, or has been damaged, restores nothing.
    for (const lacking of ['sensor_manager_agent_tls.tgz', 'device_interrogation_agent_tls.tgz', 'globals.sql', 'database.dump', 'env', 'SHA256SUMS']) {
      const bk2 = fullBackup();
      try {
        rmSync(path.join(bk2, lacking), { force: true });
        withRig((rig) => {
          writeFileSync(path.join(rig.work, '.env'), 'POSTGRES_PASSWORD=p\nENCRYPTION_MASTER_KEY=key-one\n');
          const r = rig.run('restore.sh', ['--from', bk2], { STUB_VOLUMES: '' });
          expect(r.status !== 0 && r.out.includes(lacking) && rig.mutating().length === 0, `restore: a backup without ${lacking} is refused and nothing is touched (exit ${r.status})`);
        });
      } finally {
        rmSync(path.dirname(bk2), { recursive: true, force: true });
      }
    }
    {
      const bk3 = fullBackup();
      try {
        writeFileSync(path.join(bk3, 'database.dump'), 'tampered');
        withRig((rig) => {
          writeFileSync(path.join(rig.work, '.env'), 'POSTGRES_PASSWORD=p\nENCRYPTION_MASTER_KEY=key-one\n');
          const r = rig.run('restore.sh', ['--from', bk3], { STUB_VOLUMES: '' });
          expect(r.status !== 0 && /checksums/.test(r.out) && rig.mutating().length === 0, 'restore: a backup whose checksums do not match is refused');
        });
      } finally {
        rmSync(path.dirname(bk3), { recursive: true, force: true });
      }
    }
  }
  return bad;
}

test('backup.sh and restore.sh behave as INSTALL.md documents', () => {
  const bad = scenarios(HERE);
  assert.deepEqual(bad, []);
});

// Broken copies of the scripts: the scenarios above must notice each defect.
// [description, file, from, to]
const DEFECTS = [
  ['restore starts the whole install before the TLS volumes are restored', 'restore.sh',
    /echo "restore: 4\/5 agent listener TLS volumes"/, 'dc up -d; echo "restore: 4/5 agent listener TLS volumes"'],
  ['restore skips the agent TLS volumes', 'restore.sh', /for v in "\$\{TLS_VOLUMES\[@\]\}"; do\n  docker volume create/, 'for v in; do\n  docker volume create'],
  ['restore does not refuse an existing install', 'restore.sh', /\[ \$\{#EXISTING\[@\]\} -gt 0 \] && \[ "\$FORCE" != 1 \]/, 'false'],
  ['restore does not check the checksums', 'restore.sh', /\|\| die "the checksums in/, '|| true # "the checksums in'],
  ['restore ignores a missing archive', 'restore.sh', /\[ -s "\$FROM\/\$f" \] \|\| die/, 'true || die'],
  ['restore replays the bootstrap role', 'restore.sh', /grep -v -E "[^"]*" "\$FROM\/globals.sql"/, 'cat "$FROM/globals.sql"'],
  ['restore drops --exit-on-error', 'restore.sh', / --exit-on-error < "\$FROM\/database.dump"/, ' < "$FROM/database.dump"'],
  ['restore restores the database before the roles', 'restore.sh',
    /echo "restore: 2\/5 roles"/, 'dc exec -T postgres pg_restore -U "$DB_USER" -d "$DB_NAME" --exit-on-error < "$FROM/database.dump"\necho "restore: 2/5 roles"'],
  ['restore accepts another encryption key', 'restore.sh', /\[ "\$\(key_of "\$FROM\/env"\)" = "\$\(key_of "\$ENV_FILE"\)" \]/, 'true'],
  ['backup does not check the TLS volumes exist', 'backup.sh', /docker volume inspect "\$\{PROJECT\}_\$\{v\}" >\/dev\/null 2>&1 \\\n/, 'true \\\n'],
  ['backup leaves out the second TLS volume', 'backup.sh', /TLS_VOLUMES=\(sensor_manager_agent_tls device_interrogation_agent_tls\)/, 'TLS_VOLUMES=(sensor_manager_agent_tls sensor_manager_agent_tls)'],
  ['backup writes into an existing directory', 'backup.sh', /\[ ! -e "\$OUT" \] \|\| die/, 'true || die'],
  ['backup dry run still runs the dump', 'backup.sh', /if \[ "\$DRY" = 1 \]; then/, 'if [ "$DRY" = 1 ]; then\n  dc exec -T postgres pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc >/dev/null'],
];

for (const [desc, file, from, to] of DEFECTS) {
  test(`the scenarios catch a defect: ${desc}`, () => {
    const copy = mkdtempSync(path.join(tmpdir(), 'vista-br-mut-'));
    try {
      for (const f of ['backup.sh', 'restore.sh']) cpSync(path.join(HERE, f), path.join(copy, f));
      const before = readFileSync(path.join(copy, file), 'utf8');
      const after = before.replace(from, to);
      assert.notEqual(after, before, `the defect did not apply: ${desc}`);
      writeFileSync(path.join(copy, file), after);
      assert.notDeepEqual(scenarios(copy), [], `no scenario noticed: ${desc}`);
    } finally {
      rmSync(copy, { recursive: true, force: true });
    }
  });
}
