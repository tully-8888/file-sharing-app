// Performance utilities for optimizing React components

/**
 * Custom equality function for React.memo that performs a shallow comparison
 * of props, excluding functions which might be recreated on each render
 */
// Using Record<string, unknown> for broad compatibility, assuming props can be anything
export function arePropsEqual(prevProps: Record<string, unknown>, nextProps: Record<string, unknown>): boolean {
  const prevKeys = Object.keys(prevProps);
  const nextKeys = Object.keys(nextProps);

  if (prevKeys.length !== nextKeys.length) return false;

  return prevKeys.every(key => {
    const prevValue = prevProps[key];
    const nextValue = nextProps[key];

    // Skip function comparisons since they might be recreated
    if (typeof prevValue === 'function' && typeof nextValue === 'function') {
      return true;
    }
    // Handle arrays and objects with shallow comparison
    if (typeof prevValue === 'object' && prevValue !== null &&
        typeof nextValue === 'object' && nextValue !== null) {
      // If both are arrays, compare length and elements
      if (Array.isArray(prevValue) && Array.isArray(nextValue)) {
        if (prevValue.length !== nextValue.length) return false;
        // Don't do deep comparison for complex objects inside arrays
        if (prevValue.length === 0) return true;
        // For simple arrays, compare primitive values (assuming primitives)
        if (typeof prevValue[0] !== 'object') {
          return prevValue.every((val: unknown, i: number) => val === nextValue[i]);
        }
        // For complex arrays, just return true if lengths match
        return true;
      }
      // For objects, just do reference equality
      return prevValue === nextValue;
    }
    // For primitive values, do strict equality
    return prevValue === nextValue;
  });
}

/**
 * Use this for debugging re-renders in components
 * @param componentName Name of the component for logging purposes
 * @param props Props object to track
 */
export function useTraceRender(componentName: string, props: Record<string, unknown>): void {
  // Use useRef hook unconditionally at the top level
  const prev = React.useRef(props);
  
  React.useEffect(() => {
    // Keep the logic inside the effect, but run the effect itself unconditionally
    if (process.env.NODE_ENV !== 'production') {
      const changedProps: Record<string, { old: unknown; new: unknown }> = {};
      
      Object.entries(props).forEach(([key, value]) => {
        if (prev.current[key] !== value) {
          changedProps[key] = {
            old: prev.current[key],
            new: value,
          };
        }
      });
      
      if (Object.keys(changedProps).length > 0) {
        console.log(`[${componentName}] Changed props:`, changedProps);
      }
    }
    
    // Update the ref unconditionally after the check
    prev.current = props;
  }); // Add dependencies if props changes should trigger this effect, otherwise empty array []
}

// Export React methods directly for convenience
import React from 'react';
export const { 
  memo, 
  useCallback, 
  useMemo, 
  useState, 
  useEffect, 
  useRef,
  useReducer,
  createContext,
  useContext
} = React; 