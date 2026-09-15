import { describe, expect, it } from 'vitest';
import { HOST_ID, TableRoom, type RoomSocket, type ServerFrame } from '../src/room.ts';

class FakeSocket implements RoomSocket {
  readonly received: ServerFrame[] = [];
  closed: { code?: number; reason?: string } | null = null;

  send(data: string): void {
    this.received.push(JSON.parse(data) as ServerFrame);
  }

  close(code?: number, reason?: string): void {
    this.closed = { code, reason };
  }
}

function send(room: TableRoom, from: string, to: string | 'all', body: unknown): void {
  room.receive(from, JSON.stringify({ t: 'msg', to, body }));
}

describe('a table room', () => {
  it('welcomes the host and gives it the fixed host id', () => {
    const room = new TableRoom();
    const socket = new FakeSocket();
    const id = room.join(socket, 'host');
    expect(id).toBe(HOST_ID);
    expect(socket.received).toEqual([{ t: 'welcome', id: HOST_ID }]);
    expect(room.empty).toBe(false);
  });

  it('gives guests distinct ids and tells everyone already seated', () => {
    const room = new TableRoom();
    const host = new FakeSocket();
    room.join(host, 'host');

    const a = new FakeSocket();
    const idA = room.join(a, 'guest');
    expect(idA).toBe('g1');
    expect(host.received).toContainEqual({ t: 'peer-joined', id: 'g1' });

    const b = new FakeSocket();
    const idB = room.join(b, 'guest');
    expect(idB).toBe('g2');
    expect(host.received).toContainEqual({ t: 'peer-joined', id: 'g2' });
    expect(a.received).toContainEqual({ t: 'peer-joined', id: 'g2' });
    // A newcomer does not hear about itself.
    expect(b.received.filter((f) => f.t === 'peer-joined')).toEqual([]);
  });

  it('routes a message addressed to the host, from whoever holds that seat', () => {
    const room = new TableRoom();
    const host = new FakeSocket();
    room.join(host, 'host');
    const guest = new FakeSocket();
    room.join(guest, 'guest');

    send(room, 'g1', 'host', { hello: 'from guest' });
    expect(host.received).toContainEqual({ t: 'msg', from: 'g1', body: { hello: 'from guest' } });
  });

  it('routes a message addressed to one peer id', () => {
    const room = new TableRoom();
    room.join(new FakeSocket(), 'host');
    const a = new FakeSocket();
    room.join(a, 'guest');
    const b = new FakeSocket();
    room.join(b, 'guest');

    send(room, 'host', 'g2', { to: 'b only' });
    expect(a.received.filter((f) => f.t === 'msg')).toEqual([]);
    expect(b.received).toContainEqual({ t: 'msg', from: 'host', body: { to: 'b only' } });
  });

  it('broadcasts to everyone but the sender', () => {
    const room = new TableRoom();
    const host = new FakeSocket();
    room.join(host, 'host');
    const a = new FakeSocket();
    room.join(a, 'guest');
    const b = new FakeSocket();
    room.join(b, 'guest');

    send(room, 'g1', 'all', { shout: true });
    expect(host.received).toContainEqual({ t: 'msg', from: 'g1', body: { shout: true } });
    expect(b.received).toContainEqual({ t: 'msg', from: 'g1', body: { shout: true } });
    expect(a.received.filter((f) => f.t === 'msg')).toEqual([]);
  });

  it('tells the room when a peer leaves', () => {
    const room = new TableRoom();
    const host = new FakeSocket();
    room.join(host, 'host');
    const a = new FakeSocket();
    room.join(a, 'guest');

    room.leave('g1');
    expect(host.received).toContainEqual({ t: 'peer-left', id: 'g1' });
    expect(room.empty).toBe(false);
    room.leave(HOST_ID);
    expect(room.empty).toBe(true);
  });

  it('leaving twice, or a peer that was never there, is harmless', () => {
    const room = new TableRoom();
    room.join(new FakeSocket(), 'host');
    expect(() => room.leave('nobody')).not.toThrow();
    room.leave(HOST_ID);
    expect(() => room.leave(HOST_ID)).not.toThrow();
  });

  it('replaces the previous host connection when a new one claims the seat', () => {
    const room = new TableRoom();
    const first = new FakeSocket();
    room.join(first, 'host');
    const guest = new FakeSocket();
    room.join(guest, 'guest');

    const second = new FakeSocket();
    const id = room.join(second, 'host');
    expect(id).toBe(HOST_ID);
    expect(first.closed).toEqual({ code: 4000, reason: 'superseded' });
    // The seat is live again under the new socket.
    send(room, 'g1', 'host', { ping: true });
    expect(second.received).toContainEqual({ t: 'msg', from: 'g1', body: { ping: true } });
    expect(first.received).not.toContainEqual({ t: 'msg', from: 'g1', body: { ping: true } });
  });

  it('drops a message with nowhere to go, without throwing', () => {
    const room = new TableRoom();
    const host = new FakeSocket();
    room.join(host, 'host');
    expect(() => send(room, 'host', 'g9', { lost: true })).not.toThrow();
    // A client before any host has connected: the message has nowhere to land.
    const empty = new TableRoom();
    empty.join(new FakeSocket(), 'guest');
    expect(() => send(empty, 'g1', 'host', { early: true })).not.toThrow();
  });

  it('survives a garbled frame rather than taking the room down', () => {
    const room = new TableRoom();
    const host = new FakeSocket();
    room.join(host, 'host');
    expect(() => room.receive('host', '{not json')).not.toThrow();
    expect(() => room.receive('host', JSON.stringify({ t: 'nonsense' }))).not.toThrow();
    expect(host.received).toEqual([{ t: 'welcome', id: HOST_ID }]);
  });
});
