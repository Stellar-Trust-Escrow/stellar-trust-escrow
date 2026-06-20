import { NextResponse } from 'next/server';

const notesStore = global.__ARBITRATOR_NOTES__ || {};
global.__ARBITRATOR_NOTES__ = notesStore;

export async function GET(request) {
  const url = new URL(request.url);
  const workspaceId = url.searchParams.get('id');
  if (!workspaceId) {
    return NextResponse.json({ notes: '' });
  }
  return NextResponse.json(notesStore[workspaceId] ?? { notes: '' });
}

export async function POST(request) {
  try {
    const payload = await request.json();
    const { workspaceId, notes } = payload;
    if (!workspaceId) {
      return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 });
    }
    notesStore[workspaceId] = {
      notes: String(notes ?? ''),
      updatedAt: new Date().toISOString(),
    };
    return NextResponse.json(notesStore[workspaceId]);
  } catch (error) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }
}
