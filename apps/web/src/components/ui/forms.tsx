'use client';

import { Check, Eye, EyeOff, Search } from 'lucide-react';
import {
  forwardRef,
  useId,
  useState,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn, formatNumber } from '@/lib/utils';

type FieldProps = {
  label: string;
  description?: string;
  error?: string;
  success?: string;
  className?: string;
};

export interface InputProps extends InputHTMLAttributes<HTMLInputElement>, FieldProps {
  icon?: React.ReactNode;
}
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, description, error, success, icon, className, id, ...props }, ref) => {
    const generated = useId();
    const inputId = id ?? generated;
    const messageId = `${inputId}-message`;
    return (
      <div className={cn('field', className)}>
        <label className="field-label" htmlFor={inputId}>
          {label}
        </label>
        <span className={cn('field-control', error && 'is-error', success && 'is-success')}>
          {icon}
          <input
            ref={ref}
            id={inputId}
            aria-invalid={Boolean(error)}
            aria-describedby={error || success || description ? messageId : undefined}
            {...props}
          />
        </span>
        {(error || success || description) && (
          <span
            className={cn('field-message', error && 'text-danger', success && 'text-success')}
            id={messageId}
          >
            {error || success || description}
          </span>
        )}
      </div>
    );
  },
);
Input.displayName = 'Input';

export function PasswordInput(props: Omit<InputProps, 'type' | 'icon'>) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="password-field">
      <Input {...props} type={visible ? 'text' : 'password'} />
      <button
        type="button"
        className="field-action"
        aria-label={visible ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
        onClick={() => setVisible(!visible)}
      >
        {visible ? <EyeOff /> : <Eye />}
      </button>
    </div>
  );
}
export function SearchInput(props: Omit<InputProps, 'type' | 'icon'>) {
  return <Input {...props} type="search" icon={<Search size={18} aria-hidden="true" />} />;
}
export function NumberInput(props: Omit<InputProps, 'type'>) {
  return <Input {...props} type="number" inputMode="numeric" dir="ltr" />;
}

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & FieldProps
>(({ label, description, error, className, id, ...props }, ref) => {
  const generated = useId();
  const inputId = id ?? generated;
  const messageId = `${inputId}-message`;
  return (
    <div className={cn('field', className)}>
      <label className="field-label" htmlFor={inputId}>
        {label}
      </label>
      <textarea
        ref={ref}
        id={inputId}
        className={error ? 'is-error' : ''}
        aria-invalid={Boolean(error)}
        aria-describedby={error || description ? messageId : undefined}
        {...props}
      />
      {(error || description) && (
        <span className={cn('field-message', error && 'text-danger')} id={messageId}>
          {error || description}
        </span>
      )}
    </div>
  );
});
Textarea.displayName = 'Textarea';

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & FieldProps
>(({ label, description, error, className, id, children, ...props }, ref) => {
  const generated = useId();
  const inputId = id ?? generated;
  const messageId = `${inputId}-message`;
  return (
    <div className={cn('field', className)}>
      <label className="field-label" htmlFor={inputId}>
        {label}
      </label>
      <select
        ref={ref}
        id={inputId}
        className={error ? 'is-error' : ''}
        aria-invalid={Boolean(error)}
        aria-describedby={error || description ? messageId : undefined}
        {...props}
      >
        {children}
      </select>
      {(error || description) && (
        <span className={cn('field-message', error && 'text-danger')} id={messageId}>
          {error || description}
        </span>
      )}
    </div>
  );
});
Select.displayName = 'Select';

export function Checkbox({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="choice-control">
      <input type="checkbox" {...props} />
      <span className="choice-box">
        <Check size={14} />
      </span>
      <span>{label}</span>
    </label>
  );
}
export function RadioGroup({
  label,
  options,
  name,
}: {
  label: string;
  options: string[];
  name: string;
}) {
  return (
    <fieldset className="field">
      <legend className="field-label">{label}</legend>
      <div className="choice-row">
        {options.map((option) => (
          <label className="choice-control" key={option}>
            <input type="radio" name={name} value={option} />
            <span className="radio-dot" />
            <span>{option}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
export function Switch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="switch">
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="switch-track">
        <span />
      </span>
      <span>{label}</span>
    </label>
  );
}
export function Slider({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input type="range" {...props} />
    </label>
  );
}
export function OtpInput({ length = 6 }: { length?: number }) {
  return (
    <fieldset className="field">
      <legend className="field-label">رمز التحقق</legend>
      <div className="otp" dir="ltr">
        {Array.from({ length }).map((_, index) => (
          <input
            key={index}
            inputMode="numeric"
            maxLength={1}
            aria-label={`الرقم ${formatNumber(index + 1)}`}
            onInput={(event) => {
              const input = event.currentTarget;
              if (input.value.length >= 1) {
                const next = input.nextElementSibling as HTMLInputElement | null;
                next?.focus();
              }
            }}
            onKeyDown={(event) => {
              if (event.key === 'Backspace' && !event.currentTarget.value) {
                const prev = event.currentTarget.previousElementSibling as HTMLInputElement | null;
                prev?.focus();
              }
            }}
          />
        ))}
      </div>
    </fieldset>
  );
}
export function MultiSelect({ label, options }: { label: string; options: string[] }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <select multiple defaultValue={[options[0]]}>
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}
export function DatePicker(props: Omit<InputProps, 'type'>) {
  return <Input {...props} type="date" />;
}
export function TimePicker(props: Omit<InputProps, 'type'>) {
  return <Input {...props} type="time" />;
}
