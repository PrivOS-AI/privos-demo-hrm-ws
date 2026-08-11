import { describe, expect, it } from 'vitest';
import { buildSendMessageBody, isInstallationBotProvisioningError } from '../src/ui/ai-chat-bot-selection';

describe('buildSendMessageBody', () => {
  it('is byte-identical to the legacy payload when no botId is selected', () => {
    const withoutBotId = buildSendMessageBody({ roomId: 'room-1', content: 'hi', sessionId: 'session-1' });
    expect(withoutBotId).toEqual({
      entityType: 'room-chat',
      entityId: 'room-1',
      roomId: 'room-1',
      flowChatId: 'room-1',
      content: 'hi',
      sessionId: 'session-1',
    });
    expect('botId' in withoutBotId).toBe(false);
    expect('fileIds' in withoutBotId).toBe(false);
  });

  it('adds botId only when explicitly selected', () => {
    const withBotId = buildSendMessageBody({ roomId: 'room-1', content: 'hi', botId: 'bot-42' });
    expect(withBotId.botId).toBe('bot-42');
  });

  it('adds fileIds only when a fileId is attached', () => {
    const withFile = buildSendMessageBody({ roomId: 'room-1', content: 'hi', fileId: 'file-1' });
    expect(withFile.fileIds).toEqual(['file-1']);
  });
});

describe('isInstallationBotProvisioningError', () => {
  it('recognizes the Hub "no active token" failure', () => {
    expect(isInstallationBotProvisioningError(new Error('Invalid bot: no active token (bot was not provisioned correctly)'))).toBe(true);
  });

  it('does not misclassify unrelated errors', () => {
    expect(isInstallationBotProvisioningError(new Error('You do not have access to this room'))).toBe(false);
    expect(isInstallationBotProvisioningError('plain string')).toBe(false);
  });
});
