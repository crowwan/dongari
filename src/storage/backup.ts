// 백업 파일 만들기·읽기 (SPEC-002 백업). 파일 하나에 전체 저장 데이터를 담는다
import type { StoredData } from '../domain/types'
import { migrate, NewerSchemaError } from './migrate'

export interface BackupFile {
  fileName: string
  text: string
}

// 불러오기 확인 창에 보여 줄 요약
export interface BackupSummary {
  years: number[] // 장부가 있는 연도, 오래된 순
  entryCount: number // 모든 장부의 기록 수
}

// 읽지 못한 이유
// - broken: JSON 이 아니다 (깨졌거나 빈 파일)
// - not-backup: JSON 이지만 이 앱의 백업 형식이 아니다
// - newer-version: 이 앱보다 새 버전 앱이 만든 파일 (앱을 다시 열어 새 버전으로 바꿔야 함)
export type BackupReadFailure = 'broken' | 'not-backup' | 'newer-version'

export type BackupReadResult =
  | { ok: true; data: StoredData; summary: BackupSummary }
  | { ok: false; reason: BackupReadFailure }

function twoDigits(value: number): string {
  return String(value).padStart(2, '0')
}

// 파일 이름 날짜는 폰의 오늘 날짜(현지 시각)
function localDate(now: Date): string {
  return `${now.getFullYear()}-${twoDigits(now.getMonth() + 1)}-${twoDigits(now.getDate())}`
}

// 확장자는 .txt: 안드로이드 크롬·삼성 인터넷은 .json 파일을 공유 화면으로 보내지 않는다 (SPEC-002 변경 이력 #8).
// 내용은 JSON 이고, 메모 앱으로 열어도 읽히게 두 칸 들여쓰기로 줄을 나눈다.
// 파일의 마지막 백업 시각은 그 파일을 만든 시각: 새 폰에서 불러온 직후 백업 안내가 뜨지 않게 (SPEC-002 #38).
// 기기 데이터는 바꾸지 않는다 — 기기의 마지막 백업은 보내기에 성공했을 때만 남긴다
export function createBackup(data: StoredData, now: Date): BackupFile {
  const contents: StoredData = { ...data, settings: { ...data.settings, lastBackupAt: now.toISOString() } }
  return {
    fileName: `동아리회계-백업-${localDate(now)}.txt`,
    text: JSON.stringify(contents, null, 2),
  }
}

function summarize(data: StoredData): BackupSummary {
  const ledgers = Object.values(data.ledgers).sort((a, b) => a.year - b.year)
  return {
    years: ledgers.map((item) => item.year),
    entryCount: ledgers.reduce((sum, item) => sum + item.entries.length, 0),
  }
}

// 백업 파일 글자를 검증해 저장 데이터로 만든다. 낮은 버전 파일은 저장소와 같은 마이그레이션을 거친다
export function readBackup(text: string): BackupReadResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, reason: 'broken' }
  }
  try {
    const data = migrate(raw)
    return { ok: true, data, summary: summarize(data) }
  } catch (error) {
    if (error instanceof NewerSchemaError) return { ok: false, reason: 'newer-version' }
    return { ok: false, reason: 'not-backup' }
  }
}
