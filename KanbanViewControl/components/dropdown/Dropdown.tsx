import * as React from "react";
import { Dropdown, IDropdownOption } from "@fluentui/react/lib/Dropdown";
import { dropdownStyles } from "./styles";

/**
 * Titelzeile: bei Mehrfachauswahl nur der erste Wert plus "+N" statt aller Werte
 * hintereinander (sonst waechst das Feld unbegrenzt). Die vollstaendige Auswahl steht
 * im Tooltip; zu lange Einzelwerte kuerzt das CSS mit Ellipse.
 */
const renderTitle = (selected?: IDropdownOption[]): JSX.Element | null => {
  if (!selected || selected.length === 0) return null;
  const all = selected.map((o) => o.text).join(", ");
  const text =
    selected.length > 1 ? `${selected[0].text} +${selected.length - 1}` : selected[0].text;
  return <span title={all}>{text}</span>;
};

interface IPropsSingle {
  label: string;
  placeholder?: string;
  selectedOption?: IDropdownOption;
  options: IDropdownOption[];
  onOptionSelected: (option: IDropdownOption) => void;
  multiSelect?: false;
  selectedKeys?: never;
  onSelectionChange?: never;
  /** Fixed width in px for the dropdown (e.g. in popup); passed to Fluent UI Dropdown */
  dropdownWidth?: number | "auto";
}

interface IPropsMulti {
  label: string;
  placeholder?: string;
  options: IDropdownOption[];
  multiSelect: true;
  selectedKeys: string[];
  onSelectionChange: (selectedKeys: string[]) => void;
  selectedOption?: never;
  onOptionSelected?: never;
  /** Fixed width in px for the dropdown (e.g. in popup); passed to Fluent UI Dropdown */
  dropdownWidth?: number | "auto";
}

type IProps = IPropsSingle | IPropsMulti;

const KanbanDropdown = (props: IProps) => {
  const { label, placeholder, options, multiSelect } = props;
  // "auto": Liste mindestens so breit wie das Feld, waechst aber mit langen Werten
  // (Fluent-Default waere exakt Feldbreite -> lange Werte abgeschnitten).
  const dropdownWidth = props.dropdownWidth ?? "auto";
  const styles =
    typeof dropdownWidth === "number"
      ? {
          ...dropdownStyles,
          dropdown: { width: dropdownWidth, minWidth: dropdownWidth },
          title: { width: dropdownWidth, minWidth: dropdownWidth, boxSizing: "border-box" as const },
        }
      : dropdownStyles;
  const [selectedItem, setSelectedItem] = React.useState<IDropdownOption | undefined>(
    !multiSelect ? props.selectedOption : undefined
  );

  React.useEffect(() => {
    if (!multiSelect && props.selectedOption) {
      setSelectedItem(props.selectedOption);
    }
  }, [multiSelect, !multiSelect && props.selectedOption?.key, !multiSelect && props.selectedOption?.text]);

  const onChange = (_: React.FormEvent<HTMLDivElement>, item?: IDropdownOption): void => {
    if (!item) return;
    if (multiSelect && "selectedKeys" in props && "onSelectionChange" in props) {
      const key = String(item.key);
      const selected = (item as IDropdownOption & { selected?: boolean }).selected ?? false;
      const next = selected
        ? [...props.selectedKeys, key]
        : props.selectedKeys.filter((k) => k !== key);
      props.onSelectionChange(next);
    } else if (!multiSelect && "onOptionSelected" in props && props.onOptionSelected) {
      setSelectedItem(item);
      props.onOptionSelected(item);
    }
  };

  if (multiSelect && "selectedKeys" in props && "onSelectionChange" in props) {
    return (
      <Dropdown
        className="kanban-dropdown"
        styles={styles}
        placeholder={placeholder ?? "Select options"}
        label={label}
        options={options}
        multiSelect
        selectedKeys={props.selectedKeys}
        onChange={onChange}
        dropdownWidth={dropdownWidth}
        onRenderTitle={renderTitle}
      />
    );
  }

  return (
    <Dropdown
      className="kanban-dropdown"
      styles={styles}
      placeholder={placeholder ?? "Select an option"}
      selectedKey={selectedItem ? selectedItem.key : undefined}
      label={label}
      options={options}
      onChange={onChange}
      dropdownWidth={dropdownWidth}
      onRenderTitle={renderTitle}
    />
  );
};

export default KanbanDropdown;
