"""BACK-28 tests for the kawalys.graph.v1 normalizer path (Graphify and CodeGraph).

Run (from the repo root, stdlib only; the hyphenated folder name rules out `unittest <path>`):
    python -B -I -m unittest discover -s docs/planning/G1/back-28 -p "test_*.py"

Every input is a SYNTHETIC ADAPTER FIXTURE (see synthetic.py): native-shaped, hand-built, never an engine rerun and
never reconstructed from the stored BACK-21 envelopes. Each acceptance case has a positive and a negative test.
"""
import copy
import gc
import json
import os
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
G1 = os.path.dirname(HERE)
FIXTURE = os.path.join(G1, "fixture")
for p in (HERE, os.path.join(G1, "back-21"), FIXTURE):
    sys.path.insert(0, p)

import normalize_codegraph as nc  # noqa: E402
import normalize_graphify as ng  # noqa: E402
import score  # noqa: E402
import synthetic as syn  # noqa: E402

TS = "2026-01-01T00:00:00Z"
STDERR = "warning: 1 code file(s) yielded no symbols: src/web/index.ts"


def gold(name):
    with open(os.path.join(HERE, "golden", name), encoding="utf-8") as fh:
        return json.load(fh)


def edge(env, typ, frm, line, to=..., **kw):
    """The edges of `env` matching type/from/line (and `to`, plus any extra field equality)."""
    out = [e for e in env["edges"] if e["type"] == typ and e["from"] == frm and e["line"] == line
           and (to is ... or e["to"] == to) and all(e.get(k) == v for k, v in kw.items())]
    return out


def omitted(env, text):
    return [o for o in env["omissions"] if text in o["what"] or text in o["reason"]]


def graphify_v1(graph=None, stderr=STDERR):
    return ng.normalize_v1(graph or syn.graphify_base(), FIXTURE, "synthetic", TS, stderr)


class CodegraphCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.db = os.path.join(cls.tmp.name, "cg.db")
        syn.build_codegraph_db(cls.db)
        cls.nofiles = os.path.join(cls.tmp.name, "cg-nofiles.db")
        syn.build_codegraph_db(cls.nofiles, with_files_table=False)

    @classmethod
    def tearDownClass(cls):
        gc.collect()  # Windows: v0 normalize() leaves its sqlite handle to the garbage collector
        cls.tmp.cleanup()

    def cg_v1(self, db=None):
        return nc.normalize_v1(db or self.db, FIXTURE, "synthetic", TS)


# ---------------------------------------------------------------------------------------------- Graphify
class GraphifyV1(unittest.TestCase):
    def test_r1_statement_folds_symbols_into_names(self):
        env = graphify_v1()
        (e,) = edge(env, "imports", syn.ORD, 3, syn.PRI)
        self.assertEqual((e["form"], e["names"], e["basis"]), ("import", ["Cart", "computeTotal"], "observed"))
        symbol_edges = [x for x in env["edges"] if x["type"] == "imports" and "::" in (x["to"] or "")]
        self.assertEqual(symbol_edges, [], "symbol imports must never be separate edges (R1)")

    def test_r1_two_statements_to_one_file_stay_two_edges(self):
        env = graphify_v1()
        self.assertEqual(len(edge(env, "imports", syn.ORD, 3, syn.PRI)), 1)
        (second,) = edge(env, "imports", syn.ORD, 7, syn.PRI)
        self.assertNotIn("names", second)

    def test_r3_ts_export_from_is_reexport_to_the_file(self):
        env = graphify_v1()
        (e,) = edge(env, "imports", syn.IDX, 2)
        self.assertEqual((e["to"], e["form"], e["names"]), (syn.ORD, "reexport", ["buildOrder"]))
        (star,) = edge(env, "imports", syn.IDX, 3)
        self.assertEqual((star["to"], star["form"]), (syn.PRI, "reexport"))
        self.assertNotIn("names", star)

    def test_r3_python_relative_import_with_all_stays_import(self):
        env = graphify_v1()
        edges = [e for e in env["edges"] if e["from"] == syn.INI]
        self.assertEqual(len(edges), 1, "re_exports module+symbol variants and the symbol import collapse to one edge")
        self.assertEqual((edges[0]["to"], edges[0]["form"], edges[0]["names"], edges[0]["line"]),
                         (syn.SVC, "import", ["OrderService"], 2))
        self.assertFalse([e for e in env["edges"] if e.get("form") == "reexport" and e["from"].endswith(".py")])

    def test_r2_barrel_symbol_is_derived_when_the_engine_shows_a_reexport(self):
        env = graphify_v1()
        (lit,) = edge(env, "imports", syn.OLS, 4, syn.IDX)
        self.assertNotIn("via", lit)
        (der,) = edge(env, "imports", syn.OLS, 4, syn.ORD, via="barrel")
        self.assertEqual((der["form"], der["names"], der["basis"]), ("import", ["buildOrder"], "observed"))

    def test_r2_no_via_without_barrel_evidence_and_no_symbol_edge(self):
        g = syn.graphify_variant(drop=[lambda e: e["source"] == "m_idx"])  # index.ts no longer re-exports anything
        env = graphify_v1(g)
        self.assertEqual(edge(env, "imports", syn.OLS, 4, syn.ORD), [])
        self.assertFalse([e for e in env["edges"] if e.get("via")])
        (lit,) = edge(env, "imports", syn.OLS, 4, syn.IDX)
        self.assertEqual(lit["names"], ["buildOrder"])
        self.assertTrue(omitted(env, "different file than the literal specifier"))

    def test_symbol_import_without_a_statement_edge_is_counted_not_emitted(self):
        g = syn.graphify_variant(add=[syn.glink("m_ord", "s_total", "imports", syn.ORD, "L50")])
        env = graphify_v1(g)
        self.assertEqual(edge(env, "imports", syn.ORD, 50), [])
        (o,) = omitted(env, "no statement edge at the same file and line")
        self.assertEqual(o["what"], "1 Graphify symbol import(s)")
        self.assertFalse([x for x in env["omissions"] if "symbol-import-without-statement" in x["what"]])

    def test_r4_basis_follows_the_engine_label_only(self):
        env = graphify_v1()
        self.assertEqual(edge(env, "calls", "src/web/orders.ts::buildOrder", 9)[0]["basis"], "observed")
        self.assertEqual(edge(env, "calls", "src/web/orders.ts::buildOrder", 10)[0]["basis"], "inferred")  # INFERRED
        self.assertEqual(edge(env, "calls", "src/web/orders.ts::buildOrder", 12)[0]["basis"], "inferred")  # indirect
        self.assertEqual(edge(env, "calls", "src/web/orders.ts::buildOrder", 13)[0]["basis"], "inferred")  # llm origin

    def test_r4_merging_duplicates_never_upgrades_a_label(self):
        g = syn.graphify_variant(add=[syn.glink("m_ord", "m_pri", "imports_from", syn.ORD, "L3", conf="INFERRED")])
        env = graphify_v1(g)
        (e,) = edge(env, "imports", syn.ORD, 3, syn.PRI)
        self.assertEqual(e["basis"], "inferred")

    def test_r7_contains_uses_child_line_and_derived(self):
        env = graphify_v1()
        (e,) = edge(env, "contains", syn.ORD, 8)
        self.assertEqual((e["to"], e["line_source"], e["basis"]), ("src/web/orders.ts::buildOrder", "derived", "observed"))
        self.assertEqual(edge(env, "contains", syn.ORD, 99), [], "the engine's own link line must not be used")
        self.assertTrue(edge(env, "contains", "src/web/pricing.ts::Cart", 7, "src/web/pricing.ts::Cart.addItem"))

    def test_r7_negative_a_missing_native_line_is_never_guessed(self):
        env = graphify_v1()
        self.assertEqual([e for e in env["edges"] if e["type"] == "calls" and e["to"] == "src/web/pricing.ts::Cart"], [])
        self.assertTrue(omitted(env, "without a source line"))
        for e in env["edges"]:
            if e["basis"] in ("observed", "inferred"):
                self.assertIsInstance(e["line"], int)

    def test_r7_negative_contains_to_a_child_without_native_location_is_not_emitted(self):
        g = syn.graphify_variant(add=[syn.glink("m_ord", "s_nolocation", "contains", syn.ORD, "L40")])
        g["nodes"].append({"id": "s_nolocation", "label": "orphan()", "file_type": "code", "source_file": syn.ORD,
                           "_callable": True})  # no source_location key at all
        env = graphify_v1(g)
        self.assertEqual([e for e in env["edges"] if e["to"] == "src/web/orders.ts::orphan"], [])
        for e in env["edges"]:
            if e["type"] == "contains":
                self.assertNotEqual(e["line"], 1, "v0's default line 1 must never reach an edge")
        self.assertTrue(omitted(env, "without a source line"))
        self.assertTrue(omitted(env, "without a source location"), "the defaulted node line is disclosed")

    def test_r4_r5_graphify_emits_no_unknown_edges(self):
        env = graphify_v1()
        self.assertEqual([e for e in env["edges"] if e["basis"] == "unknown" or e["to"] is None], [])

    def test_r8_external_targets_are_counted_not_claimed(self):
        env = graphify_v1()
        self.assertEqual(env["external_refs"], 4)  # react, json, requests (import) + requests (call)
        self.assertFalse([e for e in env["edges"] if e["to"] in ("react", "json", "requests")])

    def test_r8_negative_internal_imports_do_not_count_as_external(self):
        g = syn.graphify_variant(drop=[lambda e: e["target"].startswith("ref_")])
        self.assertEqual(graphify_v1(g)["external_refs"], 0)

    def test_r8_coverage_and_engine_warning(self):
        env = graphify_v1()
        self.assertEqual(env["coverage"], {"files_seen": 9, "files_total": 16})
        self.assertEqual([o["what"] for o in omitted(env, "engine warning")], [syn.IDX])

    def test_form_default_is_disclosed(self):
        self.assertTrue(omitted(graphify_v1(), "defaulted to import"))

    def test_envelope_is_schema_and_contract_valid(self):
        env = graphify_v1()
        schema = score.load_json(score.SCHEMA_V1_PATH)
        self.assertEqual(score.validate_schema(env, schema), [])
        self.assertEqual(score.contract_errors(env), [])
        self.assertEqual(env["envelope_version"], "kawalys.graph.v1")

    def test_scorer_e06_form_fixed_and_no_hard_failure_on_these_edges(self):
        gt = score.load_json(os.path.join(FIXTURE, "ground-truth.json"))
        r1 = score.score_v1(graphify_v1(), gt)
        r0 = score.score_v1(gold("v0-graphify.synthetic.json"), gt)
        self.assertTrue([m for m in r0["form_mismatch"] if m.startswith("E06")], "v0 shape mislabels E06")
        self.assertFalse([m for m in r1["form_mismatch"] if m.startswith("E06")])
        self.assertEqual((r1["false_observed"], r1["overclaimed"], r1["invalid_claims"]), ([], [], []))
        self.assertEqual(len(r1["derived"]), 1)

    def test_v0_path_is_byte_identical_to_the_golden(self):
        env = ng.normalize(syn.graphify_base(), FIXTURE, "synthetic", TS, STDERR)
        self.assertEqual(json.dumps(env, indent=2), json.dumps(gold("v0-graphify.synthetic.json"), indent=2))

    def test_v1_does_not_mutate_its_input(self):
        g = syn.graphify_base()
        before = copy.deepcopy(g)
        graphify_v1(g)
        self.assertEqual(g, before)

    def test_cli_default_is_v0_and_flag_selects_v1(self):
        with tempfile.TemporaryDirectory() as d:
            gp, se = os.path.join(d, "graph.json"), os.path.join(d, "stderr.log")
            with open(gp, "w", encoding="utf-8") as fh:
                json.dump(syn.graphify_base(), fh)
            with open(se, "w", encoding="utf-8") as fh:
                fh.write(STDERR)
            outs = {}
            for tag, extra in (("v0", []), ("v1", ["--contract", "v1"])):
                out = os.path.join(d, tag + ".json")
                subprocess.run([sys.executable, "-B", "-I", os.path.join(G1, "back-21", "normalize_graphify.py"),
                                gp, FIXTURE, out, "--cmd", "synthetic", "--stderr", se] + extra,
                               check=True, capture_output=True)
                with open(out, encoding="utf-8") as fh:
                    outs[tag] = json.load(fh)
            self.assertEqual(outs["v0"]["envelope_version"], "kawalys.graph.v0")
            self.assertEqual(outs["v1"]["envelope_version"], "kawalys.graph.v1")
            outs["v0"].pop("generated_at")
            want = gold("v0-graphify.synthetic.json")
            want.pop("generated_at")
            self.assertEqual(outs["v0"], want)

    # BACK-78 D1: module labels that are path suffixes (Graphify's form when basenames collide). SYNTHETIC inputs.
    SVC_M, JOB_M, OLD_M = "src/svc/models.py", "src/jobs/models.py", "src/old/svc/models.py"

    def _d1_graph(self, extra_nodes=()):
        g = syn.graphify_base()
        g["nodes"] += [syn.gnode("m_svcm", "svc/models.py", self.SVC_M, "L1"),
                       syn.gnode("m_jobm", "jobs/models.py", self.JOB_M, "L1"),
                       syn.gnode("s_item", "Item", self.SVC_M, "L4", _callable_class=True)] + list(extra_nodes)
        g["links"] += [syn.glink("m_svc", "m_svcm", "imports_from", syn.SVC, "L6"),
                       syn.glink("m_svc", "s_item", "imports", syn.SVC, "L6"),
                       syn.glink("m_svcm", "s_item", "contains", self.SVC_M, "L4")]
        return g

    def test_d1_path_suffix_module_label_is_recognized_when_unique(self):
        env = graphify_v1(self._d1_graph())
        mods = {n["id"] for n in env["nodes"] if n["kind"] == "module"}
        self.assertTrue({self.SVC_M, self.JOB_M} <= mods)
        (e,) = edge(env, "imports", syn.SVC, 6, self.SVC_M)
        self.assertEqual((e["form"], e["names"], e["basis"]), ("import", ["Item"], "observed"))
        self.assertTrue(edge(env, "contains", self.SVC_M, 4, self.SVC_M + "::Item"))
        self.assertEqual(env["coverage"]["files_seen"], 11)
        self.assertFalse(omitted(env, "ambiguous"))
        self.assertEqual(score.validate_schema(env, score.load_json(score.SCHEMA_V1_PATH)), [])
        v0 = ng.normalize(self._d1_graph(), FIXTURE, "synthetic", TS, STDERR)  # v0 N1 is unchanged: still dropped
        self.assertFalse({self.SVC_M, self.JOB_M} & {n["id"] for n in v0["nodes"]})

    def test_d1_negative_ambiguous_path_suffix_stays_dropped_and_is_reported(self):
        other = syn.gnode("m_oldm", "old/svc/models.py", self.OLD_M, "L1")  # a 2nd file ending in svc/models.py
        env = graphify_v1(self._d1_graph(extra_nodes=[other]))
        ids = {n["id"] for n in env["nodes"]}
        self.assertNotIn(self.SVC_M, ids, "svc/models.py matches two files: never guessed")
        self.assertIn(self.OLD_M, ids)
        self.assertIn(self.JOB_M, ids)
        (o,) = omitted(env, "ambiguous")
        self.assertEqual(o["what"], self.SVC_M + "::svc/models.py")
        self.assertEqual(edge(env, "imports", syn.SVC, 6), [])
        self.assertEqual([e for e in env["edges"] if e["from"] == self.SVC_M], [])

    # BACK-79 D2: Graphify models `import('./x')` as an EXTRACTED imports_from link at the call line plus a line-less
    # dynamic_import link for the same (source module, target) pair. SYNTHETIC inputs, not taken from the hold-out.
    SHELL, MON, YEAR = "src/web/shell.tsx", "src/web/views/monthly.ts", "src/web/views/yearly.ts"

    def _d2_graph(self, extra_links=()):
        g = syn.graphify_base()
        g["nodes"] += [syn.gnode("m_shell", "shell.tsx", self.SHELL, "L1"),
                       syn.gnode("s_open", "openMonthly()", self.SHELL, "L7", _callable=True),
                       syn.gnode("m_mon", "monthly.ts", self.MON, "L1"),
                       syn.gnode("s_render", "render()", self.MON, "L3", _callable=True),
                       syn.gnode("m_year", "yearly.ts", self.YEAR, "L1")]
        g["links"] += [syn.glink("m_shell", "s_open", "contains", self.SHELL, "L7"),
                       # shell.tsx:8 `const { render } = await import('./views/monthly')` inside openMonthly
                       syn.glink("s_open", "m_mon", "imports_from", self.SHELL, "L8"),
                       syn.glink("s_open", "s_render", "imports", self.SHELL, "L8"),
                       syn.glink("m_shell", "m_mon", "dynamic_import", self.SHELL, None),
                       # a dynamic_import with no companion import link at all
                       syn.glink("m_shell", "m_year", "dynamic_import", self.SHELL, None),
                       # orders.ts:5 a plain static import of the same target from ANOTHER module
                       syn.glink("m_ord", "m_mon", "imports_from", syn.ORD, "L5")] + list(extra_links)
        return g

    def test_d2_dynamic_import_companion_becomes_unknown_dynamic_and_keeps_its_line(self):
        env = graphify_v1(self._d2_graph())
        (e,) = edge(env, "imports", self.SHELL + "::openMonthly", 8)
        self.assertEqual((e["to"], e["basis"], e["form"], e["file"]), (None, "unknown", "dynamic", self.SHELL))
        self.assertIn(self.MON, e["target_hint"])
        claims = [x for x in env["edges"] if x["type"] == "imports" and x["file"] == self.SHELL
                  and x["basis"] != "unknown"]
        self.assertEqual(claims, [], "no observed or inferred import may come from the dynamic import() (R5)")
        (orphan,) = edge(env, "imports", self.SHELL, None)
        self.assertEqual((orphan["to"], orphan["basis"], orphan["form"]), (None, "unknown", "dynamic"))
        self.assertIn(self.YEAR, orphan["target_hint"])
        self.assertFalse(omitted(env, "relation dynamic_import"), "dynamic_import is mapped, not dropped")
        self.assertTrue(omitted(env, "BACK-79 D2"))
        self.assertEqual(score.validate_schema(env, score.load_json(score.SCHEMA_V1_PATH)), [])
        self.assertEqual(score.contract_errors(env), [])
        v0 = ng.normalize(self._d2_graph(), FIXTURE, "synthetic", TS, STDERR)  # v0 mapping is unchanged
        self.assertEqual([x["basis"] for x in v0["edges"] if x["from"] == self.SHELL + "::openMonthly"
                          and x["to"] == self.MON], ["observed"])

    def test_d2_negative_static_import_of_the_same_target_from_another_module_stays_observed(self):
        env = graphify_v1(self._d2_graph())
        (e,) = edge(env, "imports", syn.ORD, 5)
        self.assertEqual((e["to"], e["basis"], e["form"]), (self.MON, "observed", "import"))
        self.assertFalse(omitted(env, "cannot be told apart"))
        base = graphify_v1()
        self.assertEqual([x for x in base["edges"] if x["basis"] == "unknown"], [], "no dynamic_import, no unknown")

    def test_d2_same_module_static_and_dynamic_import_is_decided_by_line(self):
        static = syn.glink("m_shell", "m_mon", "imports_from", self.SHELL, "L2")  # shell.tsx:2 static import
        # line-less dynamic_import: L2 and L8 cannot be told apart, so both are unknown and the case is disclosed
        env = graphify_v1(self._d2_graph([static]))
        self.assertEqual([x["basis"] for x in env["edges"] if x["type"] == "imports" and x["file"] == self.SHELL
                          and x["line"] in (2, 8)], ["unknown", "unknown"])
        self.assertTrue(omitted(env, "cannot be told apart"))
        # a dynamic_import that carries a line decides it: only L8 is dynamic, L2 stays an observed static import
        g = self._d2_graph([static])
        for link in g["links"]:
            if link["relation"] == "dynamic_import" and link["target"] == "m_mon":
                link["source_location"] = "L8"
        env = graphify_v1(g)
        (s,) = edge(env, "imports", self.SHELL, 2)
        self.assertEqual((s["to"], s["basis"], s["form"]), (self.MON, "observed", "import"))
        (d,) = edge(env, "imports", self.SHELL + "::openMonthly", 8)
        self.assertEqual((d["to"], d["basis"], d["form"]), (None, "unknown", "dynamic"))
        self.assertFalse(omitted(env, "cannot be told apart"))
        self.assertEqual(score.contract_errors(env), [])


# ---------------------------------------------------------------------------------------------- CodeGraph
class CodegraphV1(CodegraphCase):
    FN, CART = "src/web/orders.ts::buildOrder", "src/web/pricing.ts::Cart"

    def test_r1_statement_folds_symbols_and_second_statement_is_separate(self):
        env = self.cg_v1()
        (e,) = edge(env, "imports", syn.ORD, 3, syn.PRI)
        self.assertEqual((e["form"], e["names"]), ("import", ["Cart", "computeTotal"]))
        (second,) = edge(env, "imports", syn.ORD, 7, syn.PRI)
        self.assertNotIn("names", second)
        self.assertEqual([x for x in env["edges"] if x["type"] == "imports" and "::" in (x["to"] or "")], [])

    def test_r2_negative_codegraph_never_claims_a_barrel(self):
        env = self.cg_v1()
        self.assertEqual(edge(env, "imports", syn.OLS, 4, syn.ORD), [])
        self.assertFalse([e for e in env["edges"] if e.get("via")])
        (lit,) = edge(env, "imports", syn.OLS, 4, syn.IDX)
        self.assertEqual(lit["names"], ["buildOrder"])
        self.assertTrue(omitted(env, "different file than the literal specifier"))

    def test_r3_unsupported_reexport_form_defaults_to_import_and_is_disclosed(self):
        env = self.cg_v1()
        (e,) = edge(env, "imports", syn.IDX, 2, syn.ORD)
        self.assertEqual(e["form"], "import")
        self.assertTrue(omitted(env, "defaulted to import"))

    def test_r4_receiver_calls_and_fuzzy_are_inferred(self):
        env = self.cg_v1()
        b = {e["line"]: e["basis"] for e in env["edges"] if e["type"] == "calls" and e["from"] == self.FN}
        self.assertEqual(b[10], "inferred")  # instance-method 0.9
        self.assertEqual(b[12], "inferred")  # fuzzy
        self.assertEqual(b[13], "inferred")  # provenance heuristic
        self.assertEqual(b[14], "inferred")  # confidence < 0.8

    def test_r4_negative_deterministic_resolution_stays_observed_and_nothing_is_upgraded(self):
        env = self.cg_v1()
        b = {e["line"]: e["basis"] for e in env["edges"] if e["type"] == "calls" and e["from"] == self.FN}
        self.assertEqual(b[9], "observed")   # resolvedBy import, tree-sitter
        self.assertEqual(b[11], "observed")  # exact-match: owner decision 1, kept observed and disclosed
        self.assertEqual(b[13], "inferred", "heuristic provenance wins over a deterministic resolvedBy")
        self.assertTrue(omitted(env, "exact-match"))

    def test_r7_contains_line_is_the_child_start_line_and_derived(self):
        env = self.cg_v1()
        self.assertEqual(edge(env, "contains", syn.ORD, 8, self.FN)[0]["line_source"], "derived")
        self.assertTrue(edge(env, "contains", syn.PRI, 5, self.CART))
        self.assertTrue(edge(env, "contains", self.CART, 7, "src/web/pricing.ts::Cart.addItem"))

    def test_r7_negative_contains_to_a_child_with_null_start_line_is_not_emitted(self):
        import sqlite3
        db = os.path.join(self.tmp.name, "cg-nullstart.db")
        syn.build_codegraph_db(db)
        con = sqlite3.connect(db)
        con.execute("insert into nodes values('fn:noline','function','orphan','orphan',?,'typescript',NULL)", (syn.ORD,))
        con.execute("insert into edges(source,target,kind,line,col) values('file:ord','fn:noline','contains',NULL,0)")
        con.commit()
        con.close()
        env = self.cg_v1(db)
        self.assertEqual([e for e in env["edges"] if e["to"] == "src/web/orders.ts::orphan"], [])
        self.assertTrue(omitted(env, "without a source line"))
        self.assertEqual(len([e for e in env["edges"] if e["type"] == "contains"]), 3, "the other 3 stay")

    def test_r7_v0_path_still_emits_null_contains_lines(self):
        env = nc.normalize(self.db, FIXTURE, "synthetic", TS)
        lines = [e["line"] for e in env["edges"] if e["type"] == "contains"]
        self.assertEqual(lines, [None, None, None])
        self.assertTrue(all("line_source" not in e for e in env["edges"]))

    def test_r7_negative_call_without_a_native_line_is_dropped_not_guessed(self):
        env = self.cg_v1()
        calls = [e for e in env["edges"] if e["type"] == "calls" and e["basis"] != "unknown"]
        self.assertEqual([e for e in calls if e["line"] is None], [])
        self.assertEqual([e["line"] for e in calls if e["to"] == self.CART], [11], "only the instantiates edge has a line")
        self.assertTrue(omitted(env, "without a source line"))
        for e in env["edges"]:
            if e["basis"] in ("observed", "inferred"):
                self.assertIsInstance(e["line"], int)

    def test_r4_r5_unresolved_refs_become_unknown_with_hint(self):
        env = self.cg_v1()
        unk = {(e["type"], e["from"], e["target_hint"], e["line"]) for e in env["edges"] if e["basis"] == "unknown"}
        self.assertEqual(unk, {("imports", syn.OLS, "react", 3), ("calls", self.FN, "pluginPath", 5),
                               ("calls", self.FN, "noline", None)})
        self.assertTrue(all(e["to"] is None for e in env["edges"] if e["basis"] == "unknown"))

    def test_r8_negative_externals_not_marked_by_the_engine_stay_unknown(self):
        env = self.cg_v1()
        self.assertEqual(env["external_refs"], 0)
        self.assertTrue([e for e in env["edges"] if e.get("target_hint") == "react" and e["basis"] == "unknown"])
        self.assertTrue(omitted(env, "external"))

    def test_unresolved_refs_other_kinds_and_unmapped_sources_are_omissions_only(self):
        env = self.cg_v1()
        self.assertTrue(omitted(env, "decorates"))
        self.assertTrue(omitted(env, "unmapped-source"))
        self.assertFalse([e for e in env["edges"] if e.get("target_hint") in ("somedecorator", "orphan")])

    def test_r8_coverage_from_the_files_table_and_fallback(self):
        self.assertEqual(self.cg_v1()["coverage"], {"files_seen": 4, "files_total": 16})
        env = self.cg_v1(self.nofiles)
        self.assertEqual(env["coverage"], {"files_seen": 4, "files_total": 16})
        self.assertTrue(omitted(env, "files table"))

    def test_envelope_is_schema_and_contract_valid(self):
        env = self.cg_v1()
        self.assertEqual(score.validate_schema(env, score.load_json(score.SCHEMA_V1_PATH)), [])
        self.assertEqual(score.contract_errors(env), [])

    def test_scorer_receiver_call_is_no_longer_overclaimed(self):
        gt = score.load_json(os.path.join(FIXTURE, "ground-truth.json"))
        r1 = score.score_v1(self.cg_v1(), gt)
        r0 = score.score_v1(gold("v0-codegraph.synthetic.json"), gt)
        self.assertTrue([x for x in r0["overclaimed"] if x.startswith("E13") or " E13 " in x or "Cart.addItem" in x],
                        "v0 shape labels the receiver call observed: overclaimed")
        self.assertEqual(r1["overclaimed"], [])
        self.assertEqual((r1["false_observed"], r1["invalid_claims"]), ([], []))

    def test_v0_path_is_byte_identical_to_the_golden(self):
        env = nc.normalize(self.db, FIXTURE, "synthetic", TS)
        self.assertEqual(json.dumps(env, indent=2), json.dumps(gold("v0-codegraph.synthetic.json"), indent=2))

    def test_cli_default_is_v0_and_flag_selects_v1(self):
        outs = {}
        for tag, extra in (("v0", []), ("v1", ["--contract", "v1"])):
            out = os.path.join(self.tmp.name, tag + ".json")
            subprocess.run([sys.executable, "-B", "-I", os.path.join(G1, "back-21", "normalize_codegraph.py"),
                            self.db, FIXTURE, out, "--cmd", "synthetic"] + extra, check=True, capture_output=True)
            with open(out, encoding="utf-8") as fh:
                outs[tag] = json.load(fh)
        self.assertEqual(outs["v0"]["envelope_version"], "kawalys.graph.v0")
        self.assertEqual(outs["v1"]["envelope_version"], "kawalys.graph.v1")
        outs["v0"].pop("generated_at")
        want = gold("v0-codegraph.synthetic.json")
        want.pop("generated_at")
        self.assertEqual(outs["v0"], want)

    # BACK-78 D4: nested functions fold into the innermost enclosing listed symbol. SYNTHETIC inputs.
    def _d4_db(self, name, nodes, edges, unresolved=()):
        import sqlite3
        db = os.path.join(self.tmp.name, name)
        syn.build_codegraph_db(db)
        con = sqlite3.connect(db)
        con.executemany("insert into nodes values(?,?,?,?,?,'typescript',?)", nodes)
        con.executemany("insert into edges(source,target,kind,metadata,line,col) values(?,?,?,?,?,0)", edges)
        con.executemany("insert into unresolved_refs(from_node_id,reference_name,reference_kind,line,col,file_path,"
                        "language,status) values(?,?,'calls',?,0,?,'typescript','unresolved')", unresolved)
        con.commit()
        con.close()
        return db

    def test_d4_nested_functions_fold_into_the_enclosing_symbol(self):
        meta = '{"resolvedBy":"import","confidence":0.95}'
        db = self._d4_db("cg-nested.db",
                         [("fn:helper", "function", "helper", "buildOrder::helper", syn.ORD, 16),
                          ("fn:inner", "function", "inner", "buildOrder::helper::inner", syn.ORD, 18)],
                         [("fn:helper", "fn:total", "calls", meta, 17),      # outgoing: folds to buildOrder
                          ("fn:helper", "fn:total", "calls", meta, 9),       # duplicates buildOrder:9 -> merged
                          ("fn:inner", "class:cart", "calls", meta, 19),     # nested twice: folds to buildOrder
                          ("fn:build", "fn:helper", "contains", None, None),  # into the nested node
                          ("fn:helper", "fn:inner", "contains", None, None),
                          ("fn:build", "fn:helper", "calls", meta, 22)],      # into the nested node
                         [("fn:helper", "later", 17, syn.ORD)])
        env = self.cg_v1(db)
        ids = {n["id"] for n in env["nodes"]}
        self.assertFalse({"src/web/orders.ts::buildOrder::helper", "src/web/orders.ts::buildOrder::helper::inner"} & ids)
        self.assertEqual([i for i in ids if i.count("::") > 1], [])
        self.assertEqual(len(edge(env, "calls", self.FN, 17, "src/web/pricing.ts::computeTotal")), 1)
        self.assertEqual(len(edge(env, "calls", self.FN, 9, "src/web/pricing.ts::computeTotal")), 1, "deduped")
        self.assertEqual(len(edge(env, "calls", self.FN, 19, self.CART)), 1)
        self.assertEqual([e for e in env["edges"] if e["from"] == e["to"]], [], "no self-edges")
        self.assertEqual([e for e in env["edges"] if "helper" in (e["to"] or "") or "helper" in e["from"]], [])
        (u,) = [e for e in env["edges"] if e.get("target_hint") == "later"]
        self.assertEqual((u["from"], u["line"], u["basis"]), (self.FN, 17, "unknown"))
        (o,) = omitted(env, "BACK-78 D4")
        self.assertEqual(o["what"], "2 CodeGraph nested function node(s)")
        self.assertEqual(score.validate_schema(env, score.load_json(score.SCHEMA_V1_PATH)), [])
        self.assertEqual(score.contract_errors(env), [])

    def test_d4_negative_class_methods_are_not_folded(self):
        meta = '{"resolvedBy":"import","confidence":0.95}'
        db = self._d4_db("cg-method.db",
                         [("fn:classfn", "function", "helper", "Cart::helper", syn.PRI, 9)],  # parent is a class
                         [("method:add", "fn:total", "calls", meta, 8),
                          ("fn:classfn", "fn:total", "calls", meta, 10)])
        env = self.cg_v1(db)
        ids = {n["id"] for n in env["nodes"]}
        self.assertIn("src/web/pricing.ts::Cart.addItem", ids)
        self.assertIn("src/web/pricing.ts::Cart::helper", ids, "parent is a class: v1 behaviour unchanged")
        self.assertTrue(edge(env, "calls", "src/web/pricing.ts::Cart.addItem", 8, "src/web/pricing.ts::computeTotal"))
        self.assertTrue(edge(env, "contains", self.CART, 7, "src/web/pricing.ts::Cart.addItem"))
        self.assertEqual(edge(env, "calls", self.CART, 8), [], "a method's call is never moved to its class")
        self.assertFalse(omitted(env, "BACK-78 D4"))
        base = self.cg_v1()
        self.assertEqual([n["id"] for n in base["nodes"]],
                         [n["id"] for n in env["nodes"] if n["id"] != "src/web/pricing.ts::Cart::helper"])


if __name__ == "__main__":
    unittest.main()
