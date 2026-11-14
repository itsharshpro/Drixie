"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Validator } from "../validate";

export interface FieldState {
  value: string;
  error: string | null;
  setValue: (v: string) => void;

  bind: {
    value: string;
    onChange: (e: { target: { value: string } }) => void;
    onBlur: () => void;
    name: string;
  };

  validate: () => boolean;
  reset: (v?: string) => void;
}

export function useField(name: string, initial: string, validator: Validator | null = null): FieldState {
  const [value, setValueState] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const showing = useRef(false);
  const valueRef = useRef(initial);
  const validatorRef = useRef(validator);

  useEffect(() => {
    validatorRef.current = validator;
  });

  const run = useCallback((v: string) => {
    const e = validatorRef.current ? validatorRef.current(v) : null;
    setError(e);
    showing.current = e !== null;
    return e === null;
  }, []);

  const setValue = useCallback(
    (v: string) => {
      valueRef.current = v;
      setValueState(v);
      if (showing.current) run(v);
    },
    [run],
  );

  const onBlur = useCallback(() => {
    const v = valueRef.current;
    if (v.length > 0 || showing.current) run(v);
  }, [run]);

  const validate = useCallback(() => run(valueRef.current), [run]);

  const reset = useCallback(
    (v: string = initial) => {
      valueRef.current = v;
      setValueState(v);
      setError(null);
      showing.current = false;
    },
    [initial],
  );

  return {
    value,
    error,
    setValue,
    bind: { value, onChange: (e) => setValue(e.target.value), onBlur, name },
    validate,
    reset,
  };
}
