# Daily Double eligibility

Daily Double bet building is derived from each race's Timeform WAGERS line. Adjacent race numbers alone never create a pool.

The card uploader preserves the Timeform line in `timeform_wagers`. When that line lists a Daily Double or Double Wagers and a following race exists on the same card, the normalized card records that first-leg-to-next-race pool. A “2nd Half” line does not start a new pool. Any supplied `daily_double_pools` list must exactly match the pools derived from Timeform.

Example:

```json
{
  "races": [
    {
      "race_number": 1,
      "timeform_wagers": "WAGERS: Exacta, Trifecta, Double Wagers."
    },
    {
      "race_number": 2,
      "timeform_wagers": "WAGERS: Exacta, Trifecta."
    }
  ]
}
```

Cards without a Timeform WAGERS indication remain valid, but the Daily Double builder stays hidden. The builder also confirms that pool metadata matches the card date and races displayed.

The existing Bet Builder exposes a direct Daily Double launch on eligible starting races only. It uses the same eligibility function as the dialog tab and opens the same dialog with Daily Double selected. Both legs remain user-selected; no ineligible race receives a launch control.
