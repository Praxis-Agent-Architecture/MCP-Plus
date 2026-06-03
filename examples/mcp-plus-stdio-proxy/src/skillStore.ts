import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export type SkillNote = {
    id: string;
    chapter: string;
    title: string;
    summary: string;
    steps: string[];
    do?: string[];
    whenToUse?: string;
    why?: string;
    avoid?: string;
    pitfalls?: string[];
    updatedAt: string;
};

export type SkillWriteInput = {
    chapter: string;
    title: string;
    summary: string;
    steps?: string[];
    do?: string[];
    whenToUse?: string;
    why?: string;
    avoid?: string;
    pitfalls?: string[];
};

export type SkillReadInput = {
    chapter?: string;
};

export type SkillStore = {
    list(serverId: string): Promise<SkillNote[]>;
    read(serverId: string, input?: SkillReadInput): Promise<SkillNote[]>;
    write(serverId: string, input: SkillWriteInput): Promise<SkillNote>;
};

export function createMemorySkillStore(initial?: Record<string, SkillNote[]>): SkillStore {
    const notes = new Map<string, SkillNote[]>(
        Object.entries(initial ?? {}).map(([serverId, entries]) => [serverId, entries.map(entry => ({ ...entry }))])
    );

    return {
        async list(serverId) {
            return [...(notes.get(serverId) ?? [])];
        },
        async read(serverId, input) {
            const entries = notes.get(serverId) ?? [];
            return filterSkillNotes(entries, input?.chapter);
        },
        async write(serverId, input) {
            const next = normalizeSkillNote(input);
            const entries = notes.get(serverId) ?? [];
            const existingIndex = entries.findIndex(entry => entry.id === next.id);
            const merged = existingIndex === -1 ? [...entries, next] : entries.with(existingIndex, next);
            notes.set(serverId, merged);
            return next;
        }
    };
}

export function createFileSkillStore(rootDirectory: string): SkillStore {
    return {
        async list(serverId) {
            return readServerNotes(rootDirectory, serverId);
        },
        async read(serverId, input) {
            const entries = await readServerNotes(rootDirectory, serverId);
            return filterSkillNotes(entries, input?.chapter);
        },
        async write(serverId, input) {
            const next = normalizeSkillNote(input);
            const path = skillFilePath(rootDirectory, serverId);
            const entries = await readServerNotes(rootDirectory, serverId);
            const existingIndex = entries.findIndex(entry => entry.id === next.id);
            const merged = existingIndex === -1 ? [...entries, next] : entries.with(existingIndex, next);
            await mkdir(dirname(path), { recursive: true });
            await writeFile(path, `${JSON.stringify({ notes: merged }, null, 2)}\n`, 'utf8');
            return next;
        }
    };
}

function filterSkillNotes(entries: readonly SkillNote[], chapterOrNoteId: string | undefined): SkillNote[] {
    if (chapterOrNoteId === undefined) {
        return [...entries];
    }

    return entries.filter(entry => entry.chapter === chapterOrNoteId || entry.id === chapterOrNoteId);
}

function normalizeSkillNote(input: SkillWriteInput): SkillNote {
    const title = input.title.trim();
    const chapter = input.chapter.trim();
    if (chapter.length === 0) {
        throw new Error('mcp_plus.skill_write requires a non-empty chapter');
    }
    if (title.length === 0) {
        throw new Error('mcp_plus.skill_write requires a non-empty title');
    }

    return {
        id: `${chapter}:${slugify(title)}`,
        chapter,
        title,
        summary: input.summary.trim(),
        steps: input.steps ?? input.do ?? [],
        do: input.do ?? input.steps ?? [],
        whenToUse: cleanOptional(input.whenToUse),
        why: cleanOptional(input.why),
        avoid: cleanOptional(input.avoid),
        pitfalls: input.pitfalls ?? (input.avoid === undefined ? undefined : [input.avoid]),
        updatedAt: new Date().toISOString()
    };
}

async function readServerNotes(rootDirectory: string, serverId: string): Promise<SkillNote[]> {
    try {
        const raw = await readFile(skillFilePath(rootDirectory, serverId), 'utf8');
        const parsed = JSON.parse(raw) as { notes?: SkillNote[] };
        return Array.isArray(parsed.notes) ? parsed.notes : [];
    } catch (error) {
        if (isNodeError(error) && error.code === 'ENOENT') {
            return [];
        }
        throw error;
    }
}

function skillFilePath(rootDirectory: string, serverId: string): string {
    return join(rootDirectory, `${serverId}.json`);
}

function slugify(value: string): string {
    const slug = value
        .toLowerCase()
        .replaceAll(/[^a-z0-9\u4e00-\u9fff]+/gu, '-')
        .replaceAll(/^-+|-+$/g, '');
    return slug.length > 0 ? slug : 'skill';
}

function cleanOptional(value: string | undefined): string | undefined {
    const trimmed = value?.trim();
    return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error && 'code' in error;
}
