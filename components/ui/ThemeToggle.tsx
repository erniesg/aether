'use client';

import { Monitor, Moon, Palette, Sun } from 'lucide-react';
import { useTheme, type ThemeMode } from '@/app/design-system/ThemeProvider';
import { IconButton } from './IconButton';
import { cn } from '@/lib/utils/cn';

const MODE_ICON: Record<ThemeMode, React.ReactNode> = {
  light: <Sun size={14} strokeWidth={1.75} />,
  dark: <Moon size={14} strokeWidth={1.75} />,
  synth: <Palette size={14} strokeWidth={1.75} />,
  system: <Monitor size={14} strokeWidth={1.75} />,
};

const MODE_LABEL: Record<ThemeMode, string> = {
  light: 'light',
  dark: 'dark',
  synth: 'synth',
  system: 'system',
};

export function ThemeToggle({ className }: { className?: string }) {
  const { mode, cycle } = useTheme();
  return (
    <IconButton
      size="xs"
      variant="ghost"
      label={`theme · ${MODE_LABEL[mode]} · click to cycle`}
      icon={MODE_ICON[mode]}
      onClick={cycle}
      title={`theme · ${MODE_LABEL[mode]}`}
      className={cn('text-ink-dim', className)}
    />
  );
}
