'use strict';

const colors = require('picocolors').createColors(true);

const moduleName = 'job-queue';
const watt = require('gigawatts');
const locks = require('xcraft-core-utils/lib/locks.js');

class PersistantJobQueue {
  constructor(
    path,
    name,
    runner,
    parallelLimit,
    useLogger = true,
    options = {}
  ) {
    // Status db
    const Database = require('better-sqlite3');
    this.db = new Database(path, options);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS JobQueue (
        jobId TEXT PRIMARY KEY,
        topic TEXT,
        seq NUMBER,
        status TEXT,
        work TEXT
      );
    `);

    this.insertJob = this.db.prepare(`
      INSERT OR REPLACE INTO JobQueue (jobId,topic,seq,status, work)
      VALUES ($jobId, $topic, $seq, $status, $work);
    `);

    this.getJob = this.db.prepare(`
      SELECT * FROM JobQueue WHERE status='waiting' ORDER BY seq LIMIT 0,1;
    `);

    this.changeJobStatus = this.db.prepare(`
      UPDATE JobQueue
      SET status=$status
      WHERE jobId=$jobId;
    `);

    this.deleteJobDone = this.db.prepare(`
      DELETE FROM JobQueue WHERE jobId=$jobId;
    `);

    this.getJobsCount = () => {
      const row = this.db.prepare(
        `SELECT COUNT(*) as count FROM JobQueue WHERE status='waiting';`
      );

      const r = row.get();
      return parseInt(r.count);
    };

    this.count = this.getJobsCount();

    this.log = useLogger && require('xcraft-core-log')(`${moduleName}`, null);
    this.name = name;
    this.runner = runner;
    this.parallelLimit = parallelLimit;
    this.running = 0;
    this.paused = false;
    this._mutex = new locks.Mutex();
    watt.wrapAll(this);
  }

  _log() {
    if (!this.log) {
      return;
    }

    const count = this.getJobsCount();

    /* FIXME: change dbg to info when it's no longer necessary */
    this.log.dbg(
      `«${colors.blackBright(
        colors.bold(this.name)
      )}» waiting:${count} running:${this.running}`
    );
  }

  run() {
    if (this.paused) {
      return;
    }
    if (this.getJobsCount() === 0) {
      this._log();
      return;
    }

    if (this.running >= this.parallelLimit) {
      return;
    }

    // Change status running
    const job = this.getJob.get();
    this.changeJobStatus.run({jobId: job.jobId, status: 'running'});
    this.running++;
    this._log();
    job.work = JSON.parse(job.work);
    setImmediate(this.runner, job, () => {
      this.deleteJobDone.run({jobId: job.jobId});
      this.running--;
      this.run();
    });

    this.run();
  }

  *push(job) {
    yield this._mutex.lock();
    try {
      this.insertJob.run({
        jobId: job.id,
        topic: job.topic || this.name,
        seq: this.count++,
        status: 'waiting',
        work: JSON.stringify(job.work || {}),
      });
    } finally {
      this._log();
      this._mutex.unlock();
      this.run();
    }
  }

  resume() {
    this.paused = false;
    this.run();
  }

  pause() {
    this.paused = true;
  }
}

module.exports = PersistantJobQueue;
