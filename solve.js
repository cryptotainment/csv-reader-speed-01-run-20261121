// A faster drop-in for csv-reader 1.0.0 (make.fun's own CSV reader): run(input) returns, for every
// input, exactly the answer csv-reader 1.0.0 returns: {columns, rows, errors}. Same reading, same
// errors, same order; only the hot path differs.
//
// How it is faster: the reference reads one character at a time and builds every field a character
// at a time. This one
//   - splits a record that holds no quote in a single native call (String split),
//   - finds a quoted field's closing quote with indexOf and slices its value out (no per-char
//     concatenation), counting its line breaks in bulk,
//   - finds an unquoted field's end with indexOf (comma / LF / CR) and slices it out.
// Pure: no clock, no randomness, no locale, nothing kept from one call to the next.

const DELIM = /[,\n\r]/g;

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;
  const len = text.length;
  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (len > 0 && text.charCodeAt(0) === 0xFEFF) pos = 1;

  // The record being read: the line it starts on and the index in rows it takes (null: the header).
  let recordLine = 1;
  let recordRow = null;

  // How the last field read ended, and how many characters readUnquoted added to it.
  let fEnded = 0;
  let fAdded = 0;

  function error(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Reads unquoted characters from pos onto `value` up to the next comma or line break: a CR not
  // followed by LF is dropped (stray_cr). Returns the field; sets fEnded and fAdded.
  function readUnquoted(value) {
    let added = 0;
    while (true) {
      if (pos >= len) {
        fEnded = END;
        fAdded = added;
        return value;
      }
      DELIM.lastIndex = pos;
      const dm = DELIM.exec(text);
      let end = len;
      let kind = END;
      if (dm !== null) {
        end = dm.index;
        const dc = dm[0].charCodeAt(0);
        kind = dc === 44 ? COMMA : dc === 10 ? LINE_BREAK : 3;
      }
      if (kind === 3) {
        if (text.charCodeAt(end + 1) === 10) {
          value = value === '' ? text.slice(pos, end) : value + text.slice(pos, end);
          added += end - pos;
          pos = end + 2;
          line += 1;
          fEnded = LINE_BREAK;
          fAdded = added;
          return value;
        }
        error('stray_cr');
        value = value === '' ? text.slice(pos, end) : value + text.slice(pos, end);
        added += end - pos;
        pos = end + 1;
        continue;
      }
      value = value === '' ? text.slice(pos, end) : value + text.slice(pos, end);
      added += end - pos;
      if (kind === COMMA) {
        pos = end + 1;
        fEnded = COMMA;
        fAdded = added;
        return value;
      }
      if (kind === LINE_BREAK) {
        pos = end + 1;
        line += 1;
        fEnded = LINE_BREAK;
        fAdded = added;
        return value;
      }
      pos = end;
      fEnded = END;
      fAdded = added;
      return value;
    }
  }

  // Reads a quoted field whose opening quote is at pos. Returns the field; sets fEnded.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    pos += 1;
    // The closing quote: the next quote that is not doubled.
    let end = text.indexOf('"', pos);
    let closed = false;
    while (end !== -1) {
      if (text.charCodeAt(end + 1) === 34) {
        end = text.indexOf('"', end + 2);
      } else {
        closed = true;
        break;
      }
    }
    if (!closed) {
      // The quote never closes: it is a literal character, and the text after it is read again as
      // an unquoted field.
      pos = open + 1;
      line = openLine;
      error('unterminated_quote');
      return readUnquoted('"');
    }
    // The field's content is [pos, end). Doubled quotes in it are one quote; CRLF and a lone CR
    // in it are each one LF, and each counts a line.
    const start = pos;
    const dd = text.indexOf('""', start);
    const hasDD = dd !== -1 && dd < end;
    const nlIn = text.indexOf('\n', start);
    const hasNL = nlIn !== -1 && nlIn < end;
    const crIn = text.indexOf('\r', start);
    const hasCR = crIn !== -1 && crIn < end;
    let value;
    if (!hasDD && !hasNL && !hasCR) {
      value = text.slice(start, end);
    } else if (!hasNL && !hasCR) {
      value = text.slice(start, end).split('""').join('"');
    } else {
      const parts = [];
      let i = start;
      let seg = start;
      let lines = 0;
      while (i < end) {
        const c = text.charCodeAt(i);
        if (c === 34) {
          // A quote in the content is the first of a doubled pair.
          parts.push(text.slice(seg, i));
          parts.push('"');
          i += 2;
          seg = i;
        } else if (c === 10) {
          parts.push(text.slice(seg, i));
          parts.push('\n');
          lines += 1;
          i += 1;
          seg = i;
        } else if (c === 13) {
          parts.push(text.slice(seg, i));
          parts.push('\n');
          lines += 1;
          i += text.charCodeAt(i + 1) === 10 ? 2 : 1;
          seg = i;
        } else {
          i += 1;
        }
      }
      parts.push(text.slice(seg, end));
      value = parts.join('');
      line += lines;
    }
    pos = end + 1;
    if (pos >= len) {
      fEnded = END;
      return value;
    }
    const c = text.charCodeAt(pos);
    if (c === 44) {
      pos += 1;
      fEnded = COMMA;
      return value;
    }
    if (c === 10) {
      pos += 1;
      line += 1;
      fEnded = LINE_BREAK;
      return value;
    }
    if (c === 13 && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      fEnded = LINE_BREAK;
      return value;
    }
    // What follows the closing quote is appended as it stands, up to the next comma or line break.
    const junk = readUnquoted(value);
    if (fAdded > 0) error('quote_junk');
    return junk;
  }

  // Finishes a record's fields: the header, or a row padded or cut to the first record's width.
  function finishRecord(fields) {
    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      return;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= len) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    // A record that holds no quote before its line break is split in one native call.
    const nl = text.indexOf('\n', pos);
    const q = text.indexOf('"', pos);
    if (q === -1 || (nl !== -1 && q > nl)) {
      let recordEnd = nl === -1 ? len : nl;
      if (nl !== -1 && recordEnd > pos && text.charCodeAt(recordEnd - 1) === 13) recordEnd -= 1;
      const cr = text.indexOf('\r', pos);
      if (cr === -1 || cr >= recordEnd) {
        const fields = text.slice(pos, recordEnd).split(',');
        pos = nl === -1 ? len : nl + 1;
        if (nl !== -1) line += 1;
        // A line that held only stray CRs is left with no characters: no record.
        if (fields.length === 1 && fields[0] === '') continue;
        finishRecord(fields);
        continue;
      }
      // A lone CR in an otherwise quote-free record: read it field by field below.
    }

    const fields = [];
    let quoted = false;
    do {
      quoted = text.charCodeAt(pos) === 34;
      fields.push(quoted ? readQuoted() : readUnquoted(''));
    } while (fEnded === COMMA);

    // A line that held only stray CRs is left with no characters: no record.
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;
    finishRecord(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
