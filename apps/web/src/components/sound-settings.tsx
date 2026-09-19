'use client';

import { Volume2, VolumeX } from 'lucide-react';
import { useState } from 'react';
import { Button, Slider, Switch } from './ui';

export function SoundSettings() {
  const [muted, setMuted] = useState(false);
  return (
    <div className="sound-settings">
      <div className="inline-between">
        <h3>إعدادات الصوت</h3>
        <Button
          variant="ghost"
          size="icon"
          aria-label={muted ? 'تشغيل الصوت' : 'كتم الصوت'}
          onClick={() => setMuted(!muted)}
        >
          {muted ? <VolumeX /> : <Volume2 />}
        </Button>
      </div>
      <Switch
        label="المؤثرات الصوتية"
        checked={!muted}
        onChange={(enabled) => setMuted(!enabled)}
      />
      <Slider label="مستوى الصوت" min="0" max="100" defaultValue="70" disabled={muted} />
    </div>
  );
}
