using Il2CppInterop.Generator;
using Il2CppInterop.Generator.Runners;
using Mono.Cecil;
using Cpp2IL.Core;
using Cpp2IL.Core.Api;
using Cpp2IL.Core.InstructionSets;
using Cpp2IL.Core.OutputFormats;
using Cpp2IL.Core.ProcessingLayers;
using LibCpp2IL;

System.Runtime.Loader.AssemblyLoadContext.Default.Resolving += (context, name) =>
{
    var path = Path.Combine(AppContext.BaseDirectory, name.Name + ".dll");
    return File.Exists(path) ? context.LoadFromAssemblyPath(path) : null;
};

if (args.Length == 4 && args[0] == "cpp2il")
{
    InstructionSetRegistry.RegisterInstructionSet<X86InstructionSet>(DefaultInstructionSets.X86_32);
    InstructionSetRegistry.RegisterInstructionSet<X86InstructionSet>(DefaultInstructionSets.X86_64);
    LibCpp2IlBinaryRegistry.RegisterBuiltInBinarySupport();
    Cpp2IlApi.InitializeLibCpp2Il(args[1], args[2], AssetRipper.Primitives.UnityVersion.Parse("2022.3.44f1"), false);
    List<Cpp2IlProcessingLayer> layers = new() { new AttributeInjectorProcessingLayer() };
    foreach (var layer in layers) layer.PreProcess(Cpp2IlApi.CurrentAppContext, layers);
    foreach (var layer in layers) layer.Process(Cpp2IlApi.CurrentAppContext);
    Directory.CreateDirectory(args[3]);
    foreach (var assembly in new AsmResolverDllOutputFormatDefault().BuildAssemblies(Cpp2IlApi.CurrentAppContext))
        assembly.Write(Path.Combine(args[3], assembly.Name + ".dll"));
    Console.WriteLine("Cpp2IL dummy assemblies generated using the pinned loader's own pipeline.");
    return;
}

if (args.Length == 5 && args[0] == "generate")
{
    var resolver = new CachedResolver();
    resolver.AddSearchDirectory(args[1]);
    resolver.AddSearchDirectory(args[3]);
    var source = Directory.GetFiles(args[1], "*.dll")
        .Where(p => Path.GetFileName(p) != "Il2CppDummyDll.dll")
        .Select(p => AssemblyDefinition.ReadAssembly(p, new ReaderParameters { AssemblyResolver = resolver }))
        .ToList();
    foreach (var assembly in source) resolver.Assemblies[assembly.Name.Name] = assembly;
    Il2CppInteropGenerator.Create(new GeneratorOptions
    {
        Source = source,
        OutputDir = Path.GetFullPath(args[2]),
        UnityBaseLibsDir = Path.GetFullPath(args[3]),
        GameAssemblyPath = Path.GetFullPath(args[4]),
        NoXrefCache = true
    }).AddInteropAssemblyGenerator().Run();
    Console.WriteLine("Generated interop assemblies: " + args[2]);
    return;
}

if (args.Length >= 3 && args[0] == "inspect")
{
    using var assembly = AssemblyDefinition.ReadAssembly(args[1]);
    foreach (var type in assembly.MainModule.Types.Where(t => args.Skip(2).Contains(t.Name)))
    {
        Console.WriteLine(type.FullName);
        foreach (var field in type.Fields) Console.WriteLine("  " + field.FullName);
        foreach (var property in type.Properties) Console.WriteLine("  " + property.FullName);
        foreach (var method in type.Methods) Console.WriteLine("  " + method.FullName);
    }
    return;
}

throw new ArgumentException("cpp2il <GameAssembly.dll> <metadata> <dummy-dir> | generate <dummy-dir> <output-dir> <unity-dir> <GameAssembly.dll> | inspect <assembly> <type>...");

sealed class CachedResolver : DefaultAssemblyResolver
{
    public Dictionary<string, AssemblyDefinition> Assemblies { get; } = new();
    public override AssemblyDefinition Resolve(AssemblyNameReference name) =>
        Assemblies.TryGetValue(name.Name, out var assembly) ? assembly : base.Resolve(name);
    public override AssemblyDefinition Resolve(AssemblyNameReference name, ReaderParameters parameters) =>
        Assemblies.TryGetValue(name.Name, out var assembly) ? assembly : base.Resolve(name, parameters);
}
