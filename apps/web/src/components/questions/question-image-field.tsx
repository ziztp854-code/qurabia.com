'use client';

import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui';
import { QuestionImage } from './question-image';

export function QuestionImageField({ initialImageUrl }: { initialImageUrl?: string | null }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const previewUrl = objectUrl || (!removeImage ? initialImageUrl : null);

  useEffect(
    () => () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    },
    [objectUrl],
  );

  const selectImage = (file: File | undefined) => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    setObjectUrl(file ? URL.createObjectURL(file) : null);
    setRemoveImage(false);
  };

  const clearImage = () => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    setObjectUrl(null);
    setRemoveImage(Boolean(initialImageUrl));
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <fieldset className="field question-image-field">
      <legend className="field-label">صورة السؤال (اختيارية)</legend>
      <input type="hidden" name="removeImage" value={removeImage ? 'true' : 'false'} />
      <div className="question-image-control">
        <label className="question-image-picker">
          <ImagePlus aria-hidden="true" />
          <span>
            <strong>{previewUrl ? 'استبدال الصورة' : 'إضافة صورة'}</strong>
            <small>JPG أو PNG أو WebP، بحد أقصى 3 ميجابايت</small>
          </span>
          <input
            ref={inputRef}
            type="file"
            name="image"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => selectImage(event.target.files?.[0])}
          />
        </label>
        {previewUrl && (
          <div className="question-image-preview">
            <QuestionImage src={previewUrl} alt="معاينة صورة السؤال" />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="question-image-remove"
              onClick={clearImage}
            >
              <Trash2 aria-hidden="true" />
              حذف الصورة
            </Button>
          </div>
        )}
      </div>
    </fieldset>
  );
}
