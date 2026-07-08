import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface PromptRef {
  id: string;
  uri: string;
  label: string;
}

/** Phase 13 — prompt catalog (ops-managed URIs; playback via media app). */
@Injectable()
export class PromptManagementService {
  private readonly baseUri: string;

  constructor(config: ConfigService) {
    this.baseUri = (config.get<string>('PROMPT_BASE_URI') || 'sip:prompts@vsp.internal').replace(/\/$/, '');
  }

  listPrompts(): PromptRef[] {
    return [
      { id: 'welcome', uri: `${this.baseUri}/welcome.wav`, label: 'Welcome' },
      { id: 'queue_position', uri: `${this.baseUri}/queue-position.wav`, label: 'Queue position' },
      { id: 'queue_timeout', uri: `${this.baseUri}/queue-timeout.wav`, label: 'Queue timeout' },
      { id: 'ivr_main', uri: `${this.baseUri}/ivr-main.wav`, label: 'IVR main menu' },
      { id: 'ivr_invalid', uri: `${this.baseUri}/ivr-invalid.wav`, label: 'IVR invalid option' },
      { id: 'conf_join', uri: `${this.baseUri}/conf-join.wav`, label: 'Conference join' },
    ];
  }

  resolve(promptId: string): PromptRef | null {
    return this.listPrompts().find((p) => p.id === promptId) ?? null;
  }

  announcementUris(ids: string[]): string[] {
    return ids.map((id) => this.resolve(id)?.uri).filter(Boolean) as string[];
  }
}
