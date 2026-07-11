// CSV 생성 및 내보내기 (웹: 다운로드, 네이티브: 공유)
import { Platform, Share } from 'react-native';

function esc(v: unknown): string {
  const s = v == null ? '' : String(v);
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export function toCsv(headers: string[], rows: (string | number | undefined)[][]): string {
  const head = headers.map(esc).join(',');
  const body = rows.map((r) => r.map(esc).join(',')).join('\n');
  // 엑셀 한글 깨짐 방지 BOM
  return '﻿' + head + '\n' + body;
}

export async function exportCsv(filename: string, csv: string): Promise<void> {
  if (Platform.OS === 'web') {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } else {
    try {
      await Share.share({ message: csv, title: filename });
    } catch {
      /* noop */
    }
  }
}
