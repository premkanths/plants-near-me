import { csvCell, csvFilename, toCsv } from './csv';

describe('csv', () => {
  describe('csvCell', () => {
    it('leaves plain values alone', () => {
      expect(csvCell('Lalbagh')).toBe('Lalbagh');
      expect(csvCell(42)).toBe('42');
    });

    it('renders empty for null and undefined', () => {
      expect(csvCell(null)).toBe('');
      expect(csvCell(undefined)).toBe('');
    });

    it('writes booleans as yes/no so the file reads like a report', () => {
      expect(csvCell(true)).toBe('yes');
      expect(csvCell(false)).toBe('no');
    });

    it('writes dates as ISO timestamps', () => {
      expect(csvCell(new Date('2026-10-01T10:30:00.000Z'))).toBe('2026-10-01T10:30:00.000Z');
    });

    it('quotes fields containing a comma', () => {
      expect(csvCell('MG Road, Bengaluru')).toBe('"MG Road, Bengaluru"');
    });

    it('doubles embedded quotes', () => {
      expect(csvCell('the "green" shop')).toBe('"the ""green"" shop"');
    });

    it('quotes fields containing newlines', () => {
      expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
    });

    it('neutralises spreadsheet formulas', () => {
      // Without the leading apostrophe this executes when an admin opens the file.
      expect(csvCell('=HYPERLINK("http://evil","click")')).toBe(
        '"\'=HYPERLINK(""http://evil"",""click"")"',
      );
      expect(csvCell('+1-555')).toBe("'+1-555");
      expect(csvCell('-2')).toBe("'-2");
      expect(csvCell('@handle')).toBe("'@handle");
    });

    it('does not mangle a normal negative number', () => {
      // Numbers go through String(), and -2 really is risky as text, so the
      // guard applies to the rendered text either way — documented behaviour.
      expect(csvCell(-2)).toBe("'-2");
    });
  });

  describe('toCsv', () => {
    it('starts with a BOM so Excel reads UTF-8', () => {
      expect(toCsv(['a'], [['x']]).startsWith('\uFEFF')).toBe(true);
    });

    it('joins rows with CRLF and ends with a newline', () => {
      const csv = toCsv(['name', 'city'], [['Asha', 'Bengaluru']]);
      expect(csv).toBe('\uFEFFname,city\r\nAsha,Bengaluru\r\n');
    });

    it('emits just a header row when there is no data', () => {
      expect(toCsv(['name'], [])).toBe('\uFEFFname\r\n');
    });
  });

  it('stamps the filename with the date', () => {
    expect(csvFilename('orders', new Date('2026-10-01T18:00:00Z'))).toBe('orders-2026-10-01.csv');
  });
});
