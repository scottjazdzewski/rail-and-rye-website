# Daily Double eligibility

Daily Double bet building appears only when a published race card includes an explicit `daily_double_pools` list. Consecutive race numbers by themselves never create a pool.

Each listed pool must identify two consecutive races present on the card and include a matching HTTPS Equibase static entry URL for the card date and first race. Cards without this metadata remain valid, but the Daily Double builder stays hidden. The UI also checks the pair against the races on the current card and the date selected in the dashboard.

Example:

```json
{
  "daily_double_pools": [
    {
      "first_race_number": 1,
      "second_race_number": 2,
      "source_url": "https://www.equibase.com/static/entry/TAM112526USA1-EQB.html"
    }
  ]
}
```

The Equibase entry menu is the provenance for the pool list. The card publisher must include only pairs where that menu lists a Daily Double wager. Do not infer eligibility from adjacent races. Legacy cards do not acquire Daily Double pools retroactively.
