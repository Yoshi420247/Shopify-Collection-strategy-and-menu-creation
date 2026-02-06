// =============================================================================
// Structured Logger
// Supports console (with ANSI colors) and JSON output modes
// =============================================================================

const ANSI = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

class Logger {
  constructor({ format = 'console', stream = process.stdout } = {}) {
    this.format = format; // 'console' | 'json' | 'csv'
    this.stream = stream;
    this._records = [];
  }

  /**
   * Log a colored message (console mode) or structured record (json mode).
   */
  log(message, color = 'reset') {
    if (this.format === 'json') {
      this._records.push({ level: 'info', message, timestamp: new Date().toISOString() });
    } else {
      const c = ANSI[color] || ANSI.reset;
      this.stream.write(`${c}${message}${ANSI.reset}\n`);
    }
  }

  info(message) { this.log(message, 'cyan'); }
  success(message) { this.log(message, 'green'); }
  warn(message) { this.log(message, 'yellow'); }
  error(message) { this.log(message, 'red'); }

  /**
   * Print a section header.
   */
  section(title) {
    if (this.format === 'json') {
      this._records.push({ level: 'section', title, timestamp: new Date().toISOString() });
    } else {
      this.stream.write('\n' + '='.repeat(70) + '\n');
      this.log(title, 'bright');
      this.stream.write('='.repeat(70) + '\n');
    }
  }

  /**
   * Add a structured data record (for JSON/CSV reports).
   */
  record(type, data) {
    this._records.push({ type, ...data, timestamp: new Date().toISOString() });
    return data;
  }

  /**
   * Flush all buffered records as JSON to stdout.
   */
  flush() {
    if (this.format === 'json') {
      this.stream.write(JSON.stringify(this._records, null, 2) + '\n');
    }
  }

  /**
   * Get all buffered records (for programmatic access / testing).
   */
  getRecords() {
    return this._records;
  }

  /**
   * Export records as CSV string.
   */
  toCSV(columns) {
    if (this._records.length === 0) return '';
    const dataRecords = this._records.filter(r => r.type);
    if (dataRecords.length === 0) return '';

    const cols = columns || Object.keys(dataRecords[0]).filter(k => k !== 'timestamp');
    const header = cols.join(',');
    const rows = dataRecords.map(r =>
      cols.map(c => {
        const val = r[c] ?? '';
        const str = String(val);
        return str.includes(',') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
      }).join(',')
    );
    return [header, ...rows].join('\n');
  }
}

/**
 * Create a logger from CLI args.
 * Detects --json and --csv flags.
 */
export function createLogger(args = process.argv) {
  if (args.includes('--json')) return new Logger({ format: 'json' });
  if (args.includes('--csv')) return new Logger({ format: 'csv' });
  return new Logger({ format: 'console' });
}

export { Logger, ANSI };
export default Logger;
