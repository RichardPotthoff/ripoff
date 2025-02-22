import re
import os
import sys
from bs4 import BeautifulSoup
from collections import defaultdict
import re

def combine_patterns(*patterns):
  combined_pattern ='|'.join(f'(?P<pattern{i}>'+pattern[0]+')' for i,pattern in enumerate(patterns))
  return (re.compile(combined_pattern,flags=re.MULTILINE),patterns)
  
def combined_re_sub(content,combined_patterns):
  compiled_re,patterns=combined_patterns
  def callback(match):
    for key,group in match.groupdict().items():
      if group and key.startswith('pattern'):
        i=int(key[7:])
        return patterns[i][1](match)
  return compiled_re.sub(callback,content)
  
#regexes for common javascript patterns:
string_pattern = r"'(?:[^'\\]|\\.)*'|" + r'"(?:[^"\\]|\\.)*"|'
multiline_string_pattern = r'`(?:[^`\\]|\\.)*`'
comment_pattern = r'//.*?(?:\n|$)'#include the trailing newline
multiline_comment_pattern = r'/\*[\s\S]*?\*/'
delimiters=r'[=({:<>;,?%&|*+-/' #removing ]}) from delimiters because of problems with asi not inserting semicolons if there is a \n behind the delimiter
whitespaces_to_right_of_delimiter =r'(?<=['+delimiters+r'])\s*'
whitespaces_to_left_of_delimiter =r'\s*(?=['+delimiters+'\]})'+r'])'
whitespaces_containing_newline=r'\s*\n\s*'
two_or_more_whitespaces = r'\s\s+'
  
combined_minify_patterns=combine_patterns(
    (string_pattern, lambda match:match.group()),           #detect strings, and put them back unminified
    (multiline_string_pattern, lambda match:match.group()), #detect strings, and put them back unminified
    (multiline_comment_pattern, lambda match:''),           #remove all comments 
    (comment_pattern, lambda match:''),                     #remove all comments
    (whitespaces_to_right_of_delimiter,lambda match:''),    #delete whitespaces if there is a delimiter to the left
    (whitespaces_to_left_of_delimiter,lambda match:''),     #delete whitespaces if there is a delimiter to the right
    (whitespaces_containing_newline,lambda match:'\n'),     #replace newline+whitespaces with a single newline
    (two_or_more_whitespaces,lambda match:' '),             #replace span of >=2 whitspaces with single whitespace
    )

minify_javascript=lambda code:combined_re_sub(code,combined_minify_patterns)      


def convert_es6_to_iife(content, module_filename=None, minify=False):
  imports={}
  import_pattern = r'(?=^|;)\s*(import\s+(?:(?:(?:(?P<default_import>\w+)(?:[,]|\s)\s*)?(?:(?P<destructuring>\{[^}]*\}\s)|(?:\*\s+as\s+(?P<module_alias>\w+))\s)?)\s*from\s+)?[\'"](?P<module_path>[^"\']+)[\'"]\s*;?)'
  
  def import_callback(match):
      groupdict=match.groupdict()
      default_import=groupdict['default_import'] # these are the named groups in the regular expression
      destructuring=groupdict['destructuring']
      module_alias=groupdict['module_alias']
      module_path=groupdict['module_path'].strip()
      module_filename=os.path.basename(module_path)
      imports[module_filename]=module_path
      result=[]
      if destructuring:
        destructuring=re.sub(r'(\w+)\s*as\s*(\w+)',r'\1 : \2',destructuring.strip()) #replace 'as' with ':'
        result.append(f'let {destructuring.strip()} = modules["{module_filename}"];')
      if module_alias:result.append(f'let {module_alias.strip()} = modules["{module_filename}"];')
      if default_import:result.append(f'let {default_import.strip()} = modules["{module_filename}"].default;')
      return '\n'.join(result)
      
  exports={}
  export_pattern = r'(?=^|;)\s*(export\s+(?P<export_default>default\s+)?(?:(?P<export_type>function|const|let|var|class)\s+)?(?P<export_name>\w+)\s*)'
  
  def export_callback(match):
      groupdict=match.groupdict()
      export_type=groupdict['export_type']
      export_name=groupdict['export_name'].strip()
      exports[export_name]=export_name
      if groupdict['export_default']:
        exports['default']=export_name;
      if export_type:
        return export_type+' '+export_name #remove the 'export' and 'default' keywords
      else:
        return ''
      
  # here we arse parsing for import and export patterns.
  # strings and comment patterns are detected simultaneously, thus preventing the detection of 
  # import/export patterns inside of strings and comments
  combined_es6_to_iife_patterns=combine_patterns(
      (string_pattern, lambda match:match.group()), #detect strings, and put them back unchanged
      (multiline_string_pattern, lambda match:match.group()),    #       
      (comment_pattern, (lambda match:'') if minify else (lambda match:match.group())), #remove comments only if minify
      (multiline_comment_pattern, (lambda match:'') if minify else (lambda match:match.group())), #
      (import_pattern,import_callback),#parse import statements, and replace them with equivalent let statements
      (export_pattern,export_callback),#parse export statements, collect export names, remove 'export [default]'
      )
  
  #the next line does all the work: the souce code is modified by the callback functions, and the
  #filenames and pathnames of the imported modules the and names of the exported symbols are collected 
  #in the 'imports' and 'exports' dictionaries. 
  content=combined_re_sub(content,combined_es6_to_iife_patterns)
  
  if exports:  # Only add the export object if there are exports
      iife_wrapper = f'\n(function(global) {{\n{content}\nif(!("modules" in global)){{\n global["modules"]={{}}\n}}\nglobal.modules["{module_filename}"] = {{{",".join(str(key)+":"+str(value) for key,value in exports.items())}}} ;\n}})(window);'
  else:
      iife_wrapper = f'\n(function(global) {{\n{content}\n}})(window);'
      
  if minify:
      iife_wrapper = minify_javascript(iife_wrapper)
  
  return iife_wrapper,imports

def gather_dependencies(content, processed_modules, dependencies, in_process=None, module_dir=None, module_filename=None, minify=False):
    if in_process==None:
      in_process=set()
    if module_filename:
      if module_filename in processed_modules:
        if module_filename in in_process:
          print(f'Circular dependency detected: Module "{module_filename}" is already being processed.')
        return ""
      else:
        in_process.add(module_filename)
        processed_modules.add(module_filename)

    # Process dependencies first
    print(f'Processing module "{module_filename if module_filename else "html <script>"}"')
        # Convert the module itself 
    converted,imports = convert_es6_to_iife(content, module_filename, minify=minify)
    dependency_content = ""
    for ifile_name,ifile_path in imports.items():
        dependencies[module_filename].add(ifile_name)
        full_path = os.path.join(os.path.dirname(module_dir), ifile_path)
        imodule_dir=os.path.dirname(full_path)
        with open(full_path, 'r') as f:
           content = f.read()
        dependency_content += gather_dependencies(content, processed_modules, dependencies,in_process,module_dir=imodule_dir,module_filename=ifile_name, minify=minify)
    if module_filename:
      in_process.remove(module_filename)
    return dependency_content + converted

def process_html(html_path,minify=False,output_file='output.html'):
    with open(html_path, 'r') as file:
        soup = BeautifulSoup(file, 'html.parser')
    
    processed_modules = set()
    dependencies = defaultdict(set)
    for style in soup.find_all('style'):
      style.string=minify_javascript(style.string)
    for script in soup.find_all('script'):
        if script.get('type') == 'module':
            module_path = script.get('src',None)
            if module_path!=None:
                full_path = os.path.join(os.path.dirname(html_path), module_path)
                module_dir = os.path.dirname(full_path)
                module_filename = os.path.basename(full_path)
                # Gather all dependencies for this module
                try:
                  with open(full_path, 'r') as f:
                      content = f.read()
                except Exception as e:
                  print(f'error reading file: {full_path}',file=sys.stderr)
                  raise e
                del script['src']  # Remove the src attribute as we've included the content
            else:
                content=script.string
                module_filename=None
                module_dir=os.path.dirname(html_path)
            script['type'] = 'text/javascript'  # Change type to standard JavaScript
            # Insert the converted IIFE content for this module and its dependencies
            iife_content = gather_dependencies(content, processed_modules, dependencies,  
                module_dir=module_dir, module_filename=module_filename,  minify=minify)
            script.string = iife_content
        else:
            # For regular scripts, insert their content
            script_path = script.get('src',None)
            if script_path:
               with open(os.path.join(os.path.dirname(html_path), script['src']), 'r') as f:
                   if minify:
                     script.string = minify_javascript(f.read())
                   else:
                     script.string = f.read()
               del script['src']
            else:
                if minify:
                   script.string=minify_javascript(script.string)

    with open(output_file, 'w') as file:
        file.write(str(soup))

if __name__ == "__main__":
    from time import perf_counter
    t1=perf_counter()
    print(f'{os.getcwd()=}')
    
    html_file = "ripoff.html"
    output_file='index.html'
    process_html(html_file,minify=True,output_file=output_file)
    print("HTML processing completed with modules converted to IIFE.")
    print(f'{output_file=}')
    t2=perf_counter()
    print(f'{t2-t1=}')	
