import { IDropdownStyles } from "@fluentui/react/lib/Dropdown";

export const dropdownStyles: Partial<IDropdownStyles> = { 
  root: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'start'
  },
  dropdown: { 
      width: 'auto',
      textAlign: 'left',
      border: 'none'
  },
  title: {
    /* Fixed height including border (32 + 2px) prevents layout shift on open/focus */
    minHeight: 34,
    height: 34,
    boxSizing: 'border-box',
  },
  /* Liste waechst mit langen Werten bis zu dieser Breite, darueber wird umbrochen statt abgeschnitten */
  callout: {
    maxWidth: 480,
  },
  dropdownOptionText: {
    whiteSpace: 'normal',
    overflow: 'visible',
    textOverflow: 'clip',
    overflowWrap: 'anywhere',
  },
  label: {
      color: '#595959',
      textAlign: 'left',
      fontSize: 12,
      fontWeight: 700,
  },
};