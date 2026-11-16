// node --test frappe/public/js/frappe/ui/island/filters/wire.test.mjs

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  check_value,
  describe as describe_raw,
  describe_rows as describe_rows_raw,
  has_rows,
  picked,
  range,
  range_rows,
  single,
  single_row,
  status_rows,
  status_values,
  contact_read,
  contact_rows,
  value_rows,
} from "./wire.js";

// desk's __, for the words a chip reads
const fmt = (text, args = []) => text.replace(/\{(\d+)\}/g, (_, i) => args[i]);
const describe_row = (row, show = String, _ = null, when = false) =>
  describe_raw(row, show, fmt, when);
const describe_rows = (rows, show = String, _ = null, names = false, max = 1) =>
  describe_rows_raw(rows, show, fmt, names, max, false);

describe("value_rows", () => {
  test("one value is a plain equals, so the list needs no IN", () => {
    assert.deepEqual(value_rows("ToDo", "status", true, ["Open"]), [
      ["ToDo", "status", "=", "Open"],
    ]);
    assert.deepEqual(value_rows("ToDo", "status", false, ["Open"]), [
      ["ToDo", "status", "!=", "Open"],
    ]);
  });

  test("several values are one in or not in row; none clears the field", () => {
    assert.deepEqual(value_rows("ToDo", "status", false, ["Open", "Closed"]), [
      ["ToDo", "status", "not in", ["Open", "Closed"]],
    ]);
    assert.deepEqual(value_rows("ToDo", "status", true, []), []);
  });
});

describe("picked", () => {
  test("reads an in value however desk kept it", () => {
    for (const value of [
      ["Open", "Closed"],
      "Open,Closed",
      '["Open","Closed"]',
    ]) {
      assert.deepEqual(picked([["ToDo", "status", "in", value]]), {
        positive: true,
        values: ["Open", "Closed"],
      });
    }
  });

  test("rows a value picker can't show are left to Advanced", () => {
    assert.equal(picked([["ToDo", "status", "is", "set"]]), null);
    assert.equal(
      picked([
        ["ToDo", "status", "!=", "Open"],
        ["ToDo", "status", "!=", "Closed"],
      ]),
      null
    );
  });
});

test("check_value reads = 1 and = 0, and leaves other rows to Advanced", () => {
  assert.equal(check_value([]), undefined);
  assert.equal(check_value([["Web Page", "published", "=", 1]]), true);
  assert.equal(check_value([["Web Page", "published", "=", "0"]]), false);
  assert.equal(check_value([["Web Page", "published", "!=", 1]]), null);
});

describe("single rows", () => {
  const DATE = ["Timespan", "=", "<", "Between"];

  test("keep desk's spelling of a condition, read in either case", () => {
    assert.deepEqual(
      single([["ToDo", "date", "timespan", "this month"]], DATE),
      {
        condition: "Timespan",
        value: "this month",
      }
    );
    assert.deepEqual(
      single_row("ToDo", "date", "Between", ["2026-01-01", "2026-01-31"]),
      [["ToDo", "date", "Between", ["2026-01-01", "2026-01-31"]]]
    );
  });

  test("a like value is wrapped in wildcards and read without them", () => {
    assert.deepEqual(single_row("ToDo", "description", "like", "urgent"), [
      ["ToDo", "description", "like", "%urgent%"],
    ]);
    assert.deepEqual(
      single([["ToDo", "description", "like", "%urgent%"]], ["like"]),
      {
        condition: "like",
        value: "urgent",
      }
    );
  });

  test("a like that is not a plain contains, such as starts with, is Advanced's", () => {
    assert.equal(
      single([["ToDo", "description", "like", "INV-%"]], ["like"]),
      null
    );
    assert.equal(
      describe_row(["ToDo", "description", "like", "INV-%"]),
      "starts with INV-"
    );
  });

  test("an empty value clears the field; a condition the picker lacks is Advanced's", () => {
    assert.deepEqual(single_row("ToDo", "description", "like", ""), []);
    assert.equal(single([["ToDo", "date", "is", "set"]], DATE), null);
  });
});

test("a number range is two rows, at least and at most, and reads back", () => {
  const rows = range_rows("Sales Invoice", "grand_total", 1000, 5000);
  assert.deepEqual(rows, [
    ["Sales Invoice", "grand_total", ">=", 1000],
    ["Sales Invoice", "grand_total", "<=", 5000],
  ]);
  assert.deepEqual(range(rows), { from: 1000, to: 5000 });
  assert.deepEqual(range_rows("Sales Invoice", "grand_total", null, 5000), [
    ["Sales Invoice", "grand_total", "<=", 5000],
  ]);
});

test("describe reads a row the way its chip shows it", () => {
  const yes_no = (v) => (v ? "Yes" : "No");
  assert.equal(
    describe_row(["ToDo", "status", "not in", ["Open", "Closed", "Cancelled"]]),
    "not Open +2"
  );
  assert.equal(describe_row(["Web Page", "published", "=", 0], yes_no), "No");
  assert.equal(
    describe_row(["ToDo", "description", "like", "%urgent%"]),
    "contains urgent"
  );
  assert.equal(
    describe_row(["Sales Invoice", "grand_total", ">=", 1000]),
    "at least 1000"
  );
  assert.equal(
    describe_row(
      ["Sales Invoice", "posting_date", "<", "01-11-2026"],
      String,
      undefined,
      true
    ),
    "before 01-11-2026"
  );
});

test('values a "not" leaves out read as one or another', () => {
  const row = ["ToDo", "status", "not in", ["Open", "Closed", "Cancelled"]];
  assert.deepEqual(describe_rows([row], String, undefined, false, 3), {
    text: "not Open, Closed or Cancelled",
    more: 0,
  });
});

test("describe_rows reads one field's rows as one chip", () => {
  const tags = [
    ["ToDo", "_user_tags", "like", "%urgent%"],
    ["ToDo", "_user_tags", "like", "%north%"],
  ];
  assert.deepEqual(describe_rows(tags, String, undefined, true), {
    text: "urgent",
    more: 1,
  });
  assert.deepEqual(
    describe_rows([
      ["Sales Invoice", "grand_total", ">=", 1000],
      ["Sales Invoice", "grand_total", "<=", 5000],
    ]),
    { text: "1000 – 5000", more: 0 }
  );
  assert.deepEqual(describe_rows(tags), { text: "2 conditions", more: 0 });
});

test("a chip names up to max values and counts the rest", () => {
  const row = ["ToDo", "status", "in", ["Open", "Closed", "Cancelled", "Hold"]];
  assert.deepEqual(describe_rows([row], String, undefined, false, 3), {
    text: "Open, Closed, Cancelled",
    more: 1,
  });
});

test("a suggestion is applied when all its rows are on, whatever the case or order", () => {
  const filters = [
    ["ToDo", "status", "in", ["Closed", "Open"]],
    ["ToDo", "date", "timespan", "this week"],
  ];
  assert.ok(has_rows(filters, [["ToDo", "status", "in", ["Open", "Closed"]]]));
  assert.ok(has_rows(filters, [["ToDo", "date", "Timespan", "this week"]]));
  assert.ok(!has_rows(filters, [["ToDo", "status", "=", "Open"]]));
});

test("a tree's record picked alone takes its descendants, and reads back as picked", () => {
  const TREE = "descendants of (inclusive)";
  assert.deepEqual(value_rows("Item", "item_group", true, ["Kitchen"], TREE), [
    ["Item", "item_group", TREE, "Kitchen"],
  ]);
  assert.deepEqual(value_rows("Item", "item_group", false, ["Kitchen"], TREE), [
    ["Item", "item_group", "!=", "Kitchen"],
  ]);
  assert.deepEqual(picked([["Item", "item_group", TREE, "Kitchen"]]), {
    positive: true,
    values: ["Kitchen"],
  });
  assert.equal(
    describe_row(["Item", "item_group", TREE, "Kitchen"]),
    "Kitchen and below"
  );
  assert.equal(
    describe_row(["Item", "item_group", "not descendants of", "Kitchen"]),
    "not descendants of Kitchen"
  );
});

test("Document Status ticks: one is =, two are != the third, all three are no filter", () => {
  const all = ["0", "1", "2"];
  const rows = (values) => status_rows("Task", "docstatus", values, all);
  assert.deepEqual(rows(["1"]), [["Task", "docstatus", "=", "1"]]);
  assert.deepEqual(rows(["0", "1"]), [["Task", "docstatus", "!=", "2"]]);
  assert.deepEqual(rows(all), []);
  assert.deepEqual(status_values([["Task", "docstatus", "!=", 2]], all), {
    positive: true,
    values: ["0", "1"],
  });
});

test("Email, Phone and Website filters write plain rows and read them back", () => {
  const rows = (kind, choice) =>
    contact_rows("Lead", "f", kind, { presence: "match", ...choice });
  assert.deepEqual(rows("email", { mode: "domain", text: "@acme.com" }), [
    ["Lead", "f", "like", "%@acme.com"],
  ]);
  assert.deepEqual(rows("phone", { mode: "starts", text: "+91" }), [
    ["Lead", "f", "like", "+91%"],
  ]);
  assert.deepEqual(
    rows("url", { mode: "domain", text: "https://www.acme.com/about" }),
    [["Lead", "f", "like", "%acme.com%"]]
  );
  assert.deepEqual(
    contact_rows("Lead", "f", "email", { presence: "not set" }),
    [["Lead", "f", "is", "not set"]]
  );
  assert.deepEqual(
    contact_read("email", [["Lead", "f", "like", "%@acme.com"]]),
    {
      presence: "match",
      mode: "domain",
      text: "acme.com",
    }
  );
  assert.equal(contact_read("email", [["Lead", "f", "like", "%a%b%"]]), null);
});
