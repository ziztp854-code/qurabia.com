'use client';

import { Laptop, Moon, Sun } from 'lucide-react';
import { useState } from 'react';
import { useTheme } from './theme-provider';
import { Button } from './ui/button';

export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const choose = (next: 'dark' | 'light' | 'system') => {
    setTheme(next);
    setOpen(false);
  };
  return (
    <div className="dropdown theme-menu">
      <Button
        variant="ghost"
        size="icon"
        aria-label={`المظهر الحالي: ${theme}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span key={resolvedTheme}>{resolvedTheme === 'dark' ? <Moon /> : <Sun />}</span>
      </Button>
      {open && (
        <div className="floating-panel" role="menu">
          <button role="menuitem" onClick={() => choose('dark')}>
            <Moon size={17} />
            داكن
          </button>
          <button role="menuitem" onClick={() => choose('light')}>
            <Sun size={17} />
            فاتح
          </button>
          <button role="menuitem" onClick={() => choose('system')}>
            <Laptop size={17} />
            النظام
          </button>
        </div>
      )}
    </div>
  );
}
