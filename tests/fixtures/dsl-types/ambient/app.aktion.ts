// Ambient flavour (aktion-runtime/dsl-globals): no imports — every component,
// `$`-builtin and injected name is a global. Compiled WITHOUT the DOM lib.
export let $n = 0;

function Home(): AktionNode {
  const [count, setCount] = $state(1);
  $effect(() => {
    const id = setTimeout(() => setCount(count + 1), 10);
    cleanup(() => clearTimeout(id));
  }, ["mount", $n]);
  const users = $http<{ name: string }[]>({ url: "/api/users" });
  const m = new Map<string, number>([["a", 1]]); // the JS Map constructor …
  return Column([
    Text(`count ${count} of ${m.size}`),
    Map(52.5, { lng: 13.4 }),                    // … and the Map component
    Async(users, { data: Column(users.data?.map((u) => Text(u.name)) ?? []) }),
    Button("Copy id", { onClick: () => console.log($util.uuid(), btoa("x"), structuredClone({ a: 1 })) }),
  ], { gap: "m" });
}

function Shell(children: Children): AktionChild {
  return Card(children);
}

const compiled: CompiledProgram = $app(Home(), Shell([Text("footer")]));
export default compiled;
