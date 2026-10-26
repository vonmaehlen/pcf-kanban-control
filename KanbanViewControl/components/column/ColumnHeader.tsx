import * as React from "react";
import { cfgBool, cfgValue } from "../../lib/board-config";
import { parseFormIdByField, resolveFormId } from "../../lib/form-id";
import { Text } from "@fluentui/react/lib/Text";
import IconButton from "../button/IconButton";
import { ColumnItem } from "../../interfaces";
import { useContext, useMemo } from "react";
import { BoardContext } from "../../context/board-context";
import { useNavigation } from "../../hooks/useNavigation";
import { getCurrencySymbolFromFormatted } from "../../lib/utils";
import { getStrings } from "../../lib/strings";
import { columnSum, hasProbabilityColumn, hasValue, useSumMode } from "../../lib/sum-mode";

interface IProps {
  column: ColumnItem
}

const ColumnHeader = ({ column }: IProps) => {
  const { context, activeView, locale } = useContext(BoardContext);
  const strings = getStrings(locale);
  // Wert oder Erwartungswert — gilt für alle Spalten, Klick auf die Summe schaltet um
  const [sumMode, setSumMode] = useSumMode();
  const { createNewRecord } = useNavigation(context);

  const allowCreateNew =
    cfgBool(context, "board.allowCreateNew") ??
    (context.parameters as { allowCreateNew?: { raw?: boolean } }).allowCreateNew?.raw !== false;

  const onAddNewRecord = async (column: string) => {
    const field = activeView?.key as string;
    // card.openForm.formIdByField: Ist die Spalte das konfigurierte Feld, entscheidet ihr Wert;
    // sonst greift nur "default".
    const formIdByField = parseFormIdByField(cfgValue(context, "card.openForm.formIdByField"));
    const value = formIdByField && field === formIdByField.field ? column : undefined;
    await createNewRecord(field, column, resolveFormId(formIdByField, value));
    context.parameters.dataset.refresh();
  };

  const count = useMemo(() => {
    return column.cards?.length ?? 0;
  }, [column.cards]);

  const estimatedValueSumAndSymbol = useMemo(() => {
    const cards = (column.cards ?? []) as unknown as Parameters<typeof columnSum>[0];
    if (!hasValue(cards)) return null;
    const withProbability = hasProbabilityColumn(cards);
    const mode = withProbability ? sumMode : "value";
    const firstFormatted = cards.find(
      (c) => (c as { estimatedvalue?: { value?: string } }).estimatedvalue?.value
    ) as { estimatedvalue?: { value?: string } } | undefined;
    const formattedStr = firstFormatted?.estimatedvalue?.value;
    const symbol = typeof formattedStr === "string"
      ? getCurrencySymbolFromFormatted(formattedStr)
      : "€";
    return { sum: columnSum(cards, mode), symbol, mode, withProbability };
  }, [column.cards, sumMode]);

  return (
    <div className="column-header-container">
      <div className="column-header">
        <Text variant="xLarge" nowrap>{column.title}</Text>
        <div className="column-actions">
          { estimatedValueSumAndSymbol != null && (estimatedValueSumAndSymbol.withProbability ? (
            <button
              type="button"
              className={`column-sum column-sum--toggle${estimatedValueSumAndSymbol.mode === "expected" ? " column-sum--expected" : ""}`}
              title={estimatedValueSumAndSymbol.mode === "expected" ? strings.sumExpectedTitle : strings.sumValueTitle}
              aria-pressed={estimatedValueSumAndSymbol.mode === "expected"}
              onClick={() => setSumMode(estimatedValueSumAndSymbol.mode === "expected" ? "value" : "expected")}
            >
              {estimatedValueSumAndSymbol.mode === "expected" && (
                <span className="column-sum-mode">{strings.sumExpectedShort}</span>
              )}
              {context.formatting.formatCurrency(estimatedValueSumAndSymbol.sum, 2, estimatedValueSumAndSymbol.symbol)}
            </button>
          ) : (
            <Text variant="small" className="column-sum" title={strings.sumNoProbability}>
              {context.formatting.formatCurrency(estimatedValueSumAndSymbol.sum, 2, estimatedValueSumAndSymbol.symbol)}
            </Text>
          )) }
          { count > 0 && <Text variant="small" className="column-counter">{count}</Text> }
          { allowCreateNew && (
            <IconButton iconName='Add' onClick={() => { onAddNewRecord(column.id as string); }} noBorder />
          ) }
        </div>
      </div>
    </div>
  );
}

export default ColumnHeader;