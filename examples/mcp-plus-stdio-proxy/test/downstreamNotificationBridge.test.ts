import { describe, expect, it } from 'vitest';

import {
    installDownstreamNotificationBridge,
    type DownstreamNotification
} from '../src/downstreamNotificationBridge.js';

describe('downstream notification bridge', () => {
    it('bridges logging, progress, list-changed, and fallback notifications to the host side', async () => {
        const handlers = new Map<string, (notification: DownstreamNotification) => void | Promise<void>>();
        const emitted: DownstreamNotification[] = [];
        const client = {
            fallbackNotificationHandler: undefined as ((notification: DownstreamNotification) => Promise<void> | void) | undefined,
            setNotificationHandler(method: string, handler: (notification: DownstreamNotification) => void | Promise<void>) {
                handlers.set(method, handler);
            }
        };

        installDownstreamNotificationBridge(client, notification => emitted.push(notification));

        await handlers.get('notifications/message')?.({
            method: 'notifications/message',
            params: { level: 'info', data: 'log line' }
        });
        await handlers.get('notifications/progress')?.({
            method: 'notifications/progress',
            params: { progressToken: 1, progress: 1, total: 2 }
        });
        await handlers.get('notifications/resources/list_changed')?.({
            method: 'notifications/resources/list_changed'
        });
        await client.fallbackNotificationHandler?.({
            method: 'acme/custom_notification',
            params: { ok: true }
        });

        expect(emitted).toEqual([
            {
                method: 'notifications/message',
                params: { level: 'info', data: 'log line' }
            },
            {
                method: 'notifications/progress',
                params: { progressToken: 1, progress: 1, total: 2 }
            },
            {
                method: 'notifications/resources/list_changed',
                params: undefined
            },
            {
                method: 'acme/custom_notification',
                params: { ok: true }
            }
        ]);
    });
});
