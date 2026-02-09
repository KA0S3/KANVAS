/**
 * Fog Overlay Theme Toggle Utility
 * 
 * This function allows you to toggle between dark and light themes
 * to test the atmospheric fog overlay effect.
 * 
 * Usage:
 * - Call toggleFogTheme() to switch themes
 * - Call setFogTheme('dark') or setFogTheme('light') to set specific theme
 * 
 * The fog overlay automatically adapts to the theme using CSS variables.
 */

export const toggleFogTheme = () => {
  const root = document.documentElement;
  const currentTheme = root.classList.contains('light') ? 'dark' : 'light';
  
  // Remove existing theme classes
  root.classList.remove('light', 'dark');
  
  // Add new theme class
  root.classList.add(currentTheme);
  
  console.log(`Fog theme switched to: ${currentTheme}`);
  return currentTheme;
};

export const setFogTheme = (theme: 'dark' | 'light') => {
  const root = document.documentElement;
  
  // Remove existing theme classes
  root.classList.remove('light', 'dark');
  
  // Add specified theme class
  root.classList.add(theme);
  
  console.log(`Fog theme set to: ${theme}`);
  return theme;
};

export const getCurrentFogTheme = (): 'dark' | 'light' => {
  const root = document.documentElement;
  return root.classList.contains('light') ? 'light' : 'dark';
};

// For development/testing - add keyboard shortcut
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    // Press 'F' key to toggle fog theme
    if (e.key === 'f' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      toggleFogTheme();
    }
  });
  
  console.log('Fog Overlay Controls:');
  console.log('- Press "F" to toggle theme');
  console.log('- Or use toggleFogTheme() / setFogTheme() functions');
}
