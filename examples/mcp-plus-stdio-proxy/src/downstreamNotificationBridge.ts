import type { NotificationMethod } from '@modelcontextprotocol/client';

export type DownstreamNotification = {
    method: string;
    params?: Record<string, unknown>;
};

export type DownstreamNotificationEmitter = (notification: DownstreamNotification) => void;

type DownstreamNotificationClient = {
    setNotificationHandler(
        method: NotificationMethod,
        handler: (notification: { method: string; params?: Record<string, unknown> }) => Promise<void> | void
    ): void;
    fallbackNotificationHandler?: unknown;
};

const BRIDGED_NOTIFICATION_METHODS = [
    'notifications/message',
    'notifications/progress',
    'notifications/resources/updated',
    'notifications/resources/list_changed',
    'notifications/tools/list_changed',
    'notifications/prompts/list_changed',
    'notifications/cancelled'
] as const;

export function installDownstreamNotificationBridge(
    client: DownstreamNotificationClient,
    emit: DownstreamNotificationEmitter
): void {
    for (const method of BRIDGED_NOTIFICATION_METHODS) {
        client.setNotificationHandler(method as NotificationMethod, notification => {
            emit({
                method: notification.method,
                params: notification.params
            });
        });
    }

    client.fallbackNotificationHandler = async (notification: DownstreamNotification) => {
        emit({
            method: notification.method,
            params: notification.params
        });
    };
}
